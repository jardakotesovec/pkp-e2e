# HTML galley filter: the documented `allowed_hosts` key is never read

*Upstream-ready report (pkp/ojs), prepared 2026-09-03 by the e2e QA agent
during the daily upstream sync. No owning spec yet (Galleys, U46, is not
built); this file is the canonical record until the team acts on it, then
it is deleted (git keeps it).*

## Summary

pkp/ojs `e470617a65` ("pkp/pkp-lib#12752 Filter galley HTML when
configured to do so") and `094218bde4` ("Do not enable HTML filter by
default") add the `[security]` options for the new HTML galley sanitizer.
The config template documents the media-host allow-list under one key and
the code reads another, so the documented key does nothing.

- `config.TEMPLATE.inc.php` (`[security]`, after `password_timeout`):

  ```
  ; When the filter_galley_html option is turned On, only specified allowed media hosts are allowed.
  ; allowed_hosts = '["doi.org", "wikipedia.org"]'
  ```

- `plugins/generic/htmlArticleGalley/classes/HtmlGalleyHelper.php`:

  ```php
  if ($allowedMediaHosts = Config::getVar('security', 'allowed_media_hosts')) {
      $config->allowMediaHosts(json_decode($allowedMediaHosts));
  }
  ```

The issue text (pkp/pkp-lib#12752) uses `allowed_hosts` as well. A site
that turns `filter_galley_html = On` and follows the template will find
external images and media in HTML galleys stripped regardless of the hosts
it listed (the sanitizer keeps only relative media plus whatever
`allowed_media_hosts` names, which nobody documented). `allowed_hosts` is
also already a `[general]` key with a different meaning (the request-host
allow-list), so reusing the name under `[security]` invites confusion
either way.

## Impact

Fails closed: media is removed rather than let through, so this is a
configuration and documentation defect, not a security weakness. The
filter is Off by default, so default installs are unaffected. The e2e
suites do not exercise the filter (no spec owns galleys yet).

## Suggested fix

Rename one side so template, issue text and code agree; `allowed_media_hosts`
in the template is the smaller change and avoids the `[general]`
`allowed_hosts` name clash.
