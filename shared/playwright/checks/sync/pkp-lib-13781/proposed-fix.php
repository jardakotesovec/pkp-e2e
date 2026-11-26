<?php
/**
 * Kept check for pkp/pkp-lib#13781 / #13780 (issue pkp/pkp-lib#13778), round 3:
 * the report's proposed fix, run by repair-driver.php --proposed.
 *
 * At the base, OMP's I9262_Highlights sets the link text of a migrated spotlight
 * with Locale::setLocale('fr_FR'), which is invalid then and restores the primary
 * locale: the link text becomes the bare key only when that locale has no
 * translations (config `locale = en_US`), and the English "Read More" otherwise
 * (`locale = en`, every 3.4 config). The PR head repairs only the bare key; this
 * repairs both, as repairContextSettings() does for the help texts.
 * (Round 1's proposal, the bare key for the help texts, was taken in round 2.)
 */

namespace PKPE2E\proposed;

use Illuminate\Support\Facades\DB;
use PKP\facades\Locale;

class I13778_RepairRenamedLocaleDefaultsProposed extends \PKP\migration\upgrade\v3_5_0\I13778_RepairRenamedLocaleDefaults
{
    protected function repairHighlightUrlTexts(array $locales): void
    {
        $sourceLocales = array_unique(['en', Locale::getDefaultLocale()]);
        foreach ($locales as $locale) {
            $urlText = __(self::HIGHLIGHT_URL_TEXT, [], $locale);
            if ($urlText === '') {
                continue;
            }
            DB::table('highlight_settings')
                ->where('setting_name', 'urlText')
                ->where('locale', $locale)
                ->get()
                ->filter(fn ($row) => $this->isBrokenDefault((string) $row->setting_value, self::HIGHLIGHT_URL_TEXT, $sourceLocales))
                ->each(fn ($row) => DB::table('highlight_settings')
                    ->where('highlight_id', $row->highlight_id)
                    ->where('locale', $locale)
                    ->where('setting_name', 'urlText')
                    ->update(['setting_value' => $urlText]));
        }
    }
}
