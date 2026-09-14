<?php
// auto_prepend_file: log wall time, peak memory and CPU per PHP request to REQPROF_OUT.
$__t0 = microtime(true); $__ru0 = getrusage();
register_shutdown_function(function () use ($__t0, $__ru0) {
    $ru = getrusage();
    $cpu = ($ru['ru_utime.tv_sec'] + $ru['ru_utime.tv_usec'] / 1e6 + $ru['ru_stime.tv_sec'] + $ru['ru_stime.tv_usec'] / 1e6)
         - ($__ru0['ru_utime.tv_sec'] + $__ru0['ru_utime.tv_usec'] / 1e6 + $__ru0['ru_stime.tv_sec'] + $__ru0['ru_stime.tv_usec'] / 1e6);
    $line = json_encode([
        't' => round($__t0, 3),
        'ms' => round((microtime(true) - $__t0) * 1000, 1),
        'cpu' => round($cpu * 1000, 1),
        'mem' => round(memory_get_peak_usage(true) / 1048576, 1),
        'm' => $_SERVER['REQUEST_METHOD'] ?? '',
        'u' => $_SERVER['REQUEST_URI'] ?? '',
        'p' => $_SERVER['SERVER_PORT'] ?? '',
        'st' => http_response_code(),
    ]) . "\n";
    file_put_contents(getenv('REQPROF_OUT') ?: '/tmp/reqprof.jsonl', $line, FILE_APPEND | LOCK_EX);
});
