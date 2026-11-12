<?php

/**
 * @file classes/testing/CitationLookupSeeder.php
 *
 * Copyright (c) 2026 Simon Fraser University
 * Copyright (c) 2026 John Willinsky
 * Distributed under the GNU GPL v3. For full terms see the file docs/COPYING.
 *
 * @class CitationLookupSeeder
 *
 * @brief The submission key `citationsLookup: 'failed'` (U42): every
 * reference the seed's `citationsRaw` queued for the metadata lookup (the
 * context's `citationsMetadataLookup` on) ends with its lookup failed for
 * good, the state the References page marks "Metadata lookup failed".
 *
 * A live site reaches it when a lookup service keeps answering a 408 or
 * 5xx (or not at all, which the app reads as 504): the chain's first step
 * (ExtractPidsJob) runs, the first service step (CrossrefJob for a
 * reference with no DOI, OpenAlexJob for one with a DOI, CrossrefJob then
 * returning at once) prepends a delayed copy of itself eight times
 * (CitationLookupJob::retryAfterServiceError, 5 min doubling, about a day)
 * and then fails the job: the queue's Job::fail deletes the job and the
 * rest of the chain, CallQueuedHandler::failed runs the chain's catch
 * callback and CitationJob::failed (status FAILED, -1, and the "Citation
 * metadata lookup abandoned" log line), and PKPQueueProvider's
 * Queue::failing listener stores the `failed_jobs` row.
 *
 * The seed walks the same chain with the app's own code, after the build's
 * transaction commits (the database queue is `after_commit`, so the chain's
 * `jobs` row exists only then):
 *  1. the chain's ExtractPidsJob, reserved by its id and run through the
 *     app's queue worker (JobScenarioBuilder::reserve / ::process), which
 *     queues the chain's next job;
 *  2. for a reference that now has a DOI, the CrossrefJob the same way (it
 *     returns at once and queues the OpenAlexJob; a release by the job's
 *     rate limiter is run again after the limiter's second);
 *  3. the service step, reserved by its id, with its retry budget spent
 *     (serviceRetries = MAX_SERVICE_RETRIES on the job the queue hands
 *     over) and its own retryAfterServiceError(504), the answer every
 *     unreachable service gets: the job fails for good through the
 *     queue's own Job::fail, as above.
 * Deliberate deviations (parity ledger): the eight delayed retries are not
 * run (they change nothing but the job's own row), so the `failed_jobs`
 * payload is the first try's (no serviceRetries, no delay in the
 * serialized command) where a live site stores the eighth retry's
 * (serviceRetries 8 and its delay); no request leaves the server.
 */

namespace PKP\testing;

use APP\facades\Repo;
use Illuminate\Queue\DatabaseQueue;
use Illuminate\Queue\Events\JobQueued;
use Illuminate\Support\Facades\DB;
use PKP\citation\enum\CitationProcessingStatus;
use PKP\context\Context;
use PKP\jobs\citation\CitationJob;
use PKP\jobs\citation\CitationLookupJob;
use PKP\jobs\citation\CrossrefJob;
use PKP\jobs\citation\ExtractPidsJob;
use PKP\jobs\citation\OpenAlexJob;

class CitationLookupSeeder
{
    public const STATES = ['failed'];

    /** The status code the app gives a service that does not answer (ExternalServicesHelper). */
    protected const UNREACHABLE_STATUS = 504;

    /** @var array<int, array{citationId: int, class: string, id: int, connection: string, queue: string, uuid: string}> */
    private array $queued = [];

    private bool $watching = false;

    /**
     * Read `citationsLookup` (parse phase, no writes): 'failed' only, and
     * only where the seed queues a lookup: a `citationsRaw` with a
     * reference in it, on a context with the lookup on.
     */
    public static function parse(Spec $root, Context $context, ?string $citationsRaw): ?string
    {
        if (!$root->has('citationsLookup')) {
            return null;
        }
        $state = $root->get('citationsLookup');
        if (!is_string($state) || !in_array($state, self::STATES, true)) {
            throw new SpecException('citationsLookup', 'citationsLookup must be one of: ' . implode(', ', self::STATES));
        }
        if (!class_exists(CitationLookupJob::class)) {
            throw new SpecException('citationsLookup', 'This app has no references metadata lookup');
        }
        if ($citationsRaw === null || trim($citationsRaw) === '') {
            throw new SpecException('citationsLookup', 'citationsLookup needs citationsRaw with at least one reference: it is the lookup of the references the seed adds');
        }
        if (!$context->getData('citationsMetadataLookup')) {
            throw new SpecException('citationsLookup', 'citationsLookup needs the context\'s citationsMetadataLookup on: with the lookup off no reference is queued for one');
        }
        return $state;
    }

    /**
     * Record every citation lookup job queued from here on (the chain's
     * first job is queued when the build commits, the next ones as the
     * steps run).
     */
    public function watch(): void
    {
        if ($this->watching) {
            return;
        }
        $this->watching = true;
        app('events')->listen(JobQueued::class, function (JobQueued $event) {
            if (!$event->job instanceof CitationJob) {
                return;
            }
            $this->queued[] = [
                'citationId' => self::citationIdOf($event->job),
                'class' => get_class($event->job),
                'id' => (int) $event->id,
                'connection' => (string) $event->connectionName,
                'queue' => (string) ($event->queue ?? $event->job->queue),
                'uuid' => (string) (json_decode((string) $event->payload, true)['uuid'] ?? ''),
            ];
        });
    }

    /**
     * After the commit: fail for good the lookup of every reference whose
     * chain the build queued. Returns one entry per reference, in the
     * order the chains were queued.
     *
     * @return array<int, array{citationId: int, failedJobId: int, job: string}>
     */
    public function failQueuedLookups(): array
    {
        $chains = array_values(array_filter($this->queued, fn (array $job) => $job['class'] === ExtractPidsJob::class));
        if ($chains === []) {
            throw new \RuntimeException('citationsLookup: the build queued no metadata lookup');
        }
        $failed = [];
        foreach ($chains as $first) {
            $failed[] = $this->failLookup($first);
        }
        return $failed;
    }

    /**
     * One reference: step 1 run, a DOI's Crossref step run, the service
     * step failed for good.
     *
     * @return array{citationId: int, failedJobId: int, job: string}
     */
    protected function failLookup(array $first): array
    {
        $citationId = $first['citationId'];
        $this->run($first);
        $next = $this->next($citationId, CrossrefJob::class);

        $citation = Repo::citation()->get($citationId);
        if ($citation && $citation->getData('doi')) {
            // CrossrefJob returns at once on a DOI; the lookup goes on to OpenAlex.
            $this->run($next);
            $next = $this->next($citationId, OpenAlexJob::class);
        }

        $queue = $this->queue($next);
        $databaseJob = JobScenarioBuilder::reserve($queue, $next['queue'], $next['id']);
        if (!$databaseJob) {
            throw new \RuntimeException("citationsLookup: the {$next['class']} job {$next['id']} of citation {$citationId} was taken by another worker");
        }
        $command = unserialize($databaseJob->payload()['data']['command']);
        if (!$command instanceof CitationLookupJob) {
            throw new \RuntimeException("citationsLookup: the job {$next['id']} is not a lookup job");
        }
        $command->setJob($databaseJob);
        // The job as the eighth retry hands it over: its budget spent, the
        // service unreachable again. Its own check then fails it.
        $status = self::UNREACHABLE_STATUS;
        \Closure::bind(function () use ($status) {
            $this->serviceRetries = static::MAX_SERVICE_RETRIES;
            $this->retryAfterServiceError($status);
        }, $command, CitationLookupJob::class)();

        $failedJob = DB::table('failed_jobs')
            ->where('payload', 'like', '%"uuid":"' . $next['uuid'] . '"%')
            ->first();
        $citation = Repo::citation()->get($citationId);
        if (!$failedJob
            || DB::table('jobs')->where('id', $next['id'])->exists()
            || !$citation
            || (int) $citation->getData('processingStatus') !== CitationProcessingStatus::FAILED->value) {
            throw new \RuntimeException("citationsLookup: the lookup of citation {$citationId} did not fail for good");
        }
        return ['citationId' => $citationId, 'failedJobId' => (int) $failedJob->id, 'job' => $next['class']];
    }

    /**
     * Run one queued job of the chain through the app's queue worker, by
     * its id; a release by its rate limiter (the queue stores it again
     * under a new id, the same uuid) is run again once the limiter's
     * one-second window has passed.
     */
    protected function run(array $job): void
    {
        $queue = $this->queue($job);
        $id = $job['id'];
        for ($try = 0; $try < 5; $try++) {
            $databaseJob = JobScenarioBuilder::reserve($queue, $job['queue'], $id);
            if (!$databaseJob) {
                throw new \RuntimeException("citationsLookup: the {$job['class']} job {$id} was taken by another worker");
            }
            JobScenarioBuilder::process($job['connection'], $databaseJob);
            if (!$databaseJob->isReleased()) {
                if ($databaseJob->hasFailed()) {
                    throw new \RuntimeException("citationsLookup: the {$job['class']} job {$id} failed");
                }
                return;
            }
            $id = (int) DB::table('jobs')->where('payload', 'like', '%"uuid":"' . $job['uuid'] . '"%')->value('id');
            usleep(1_100_000);
        }
        throw new \RuntimeException("citationsLookup: the {$job['class']} job {$job['id']} did not run");
    }

    /** The chain's job of that class queued for the citation, once its previous job ran. */
    protected function next(int $citationId, string $class): array
    {
        foreach (array_reverse($this->queued) as $job) {
            if ($job['citationId'] === $citationId && $job['class'] === $class) {
                return $job;
            }
        }
        throw new \RuntimeException("citationsLookup: no {$class} was queued for citation {$citationId}");
    }

    protected function queue(array $job): DatabaseQueue
    {
        $queue = app('queue')->connection($job['connection']);
        if (!$queue instanceof DatabaseQueue) {
            throw new \RuntimeException('The queue connection "' . $job['connection'] . '" is not the database queue');
        }
        return $queue;
    }

    protected static function citationIdOf(CitationJob $job): int
    {
        return (int) \Closure::bind(fn () => $this->citationId, $job, CitationJob::class)();
    }
}
