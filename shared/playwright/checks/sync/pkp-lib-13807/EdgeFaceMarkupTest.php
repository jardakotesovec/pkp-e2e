<?php
// PR review of pkp/pkp-lib#13807 (crossref-ojs#121/#122/#123, crossref-ops#78/#79/#80): the PR's
// appendFaceMarkup() on inputs its own TitleFaceMarkupTest leaves out. Prints each case's <title>
// content and whether the result is well-formed against Crossref's face markup; never fails.
// Run from an app root (OJS or OPS, any line):
//   PKP_CONFIG_FILE=$PWD/config.test.inc.php php lib/pkp/lib/vendor/bin/phpunit -c lib/pkp/tests/phpunit.xml \
//     --no-output-on-failure <repo>/shared/playwright/checks/sync/pkp-lib-13807/EdgeFaceMarkupTest.php
namespace APP\plugins\generic\crossref\tests;

use APP\plugins\generic\crossref\CrossrefExportDeployment;
use DOMDocument;
use Mockery;
use PKP\tests\PKPTestCase;

class EdgeFaceMarkupTest extends PKPTestCase
{
    public function testEdges(): void
    {
        $class = class_exists('APP\plugins\generic\crossref\filter\PreprintCrossrefXmlFilter')
            ? 'APP\plugins\generic\crossref\filter\PreprintCrossrefXmlFilter'
            : 'APP\plugins\generic\crossref\filter\IssueCrossrefXmlFilter';
        $deployment = Mockery::mock(CrossrefExportDeployment::class);
        $deployment->shouldReceive('getNamespace')->andReturn('http://www.crossref.org/schema/5.3.1');
        $filter = $this->getMockBuilder($class)->disableOriginalConstructor()->onlyMethods([])->getMock();
        $filter->setDeployment($deployment);
        $cases = [
            'unicode' => 'Ångström – α-helix “quoted” 日本語',
            'nbsp' => 'a&nbsp;b',
            'space between faces' => '<i>Homo</i> <i>sapiens</i>',
            'leading space before face' => ' <i>a</i> b',
            'nested' => '<b><i>x</i></b>',
            'nested sup in i' => '<i>E=mc<sup>2</sup></i>',
            'old plain title bare lt' => 'x<y and a < b',
            'old plain title lt-letter' => 'p<b then',
            'old plain title quote amp' => 'Tom & Jerry\'s "x"',
            'br' => 'a<br>b',
            'p wrapper' => '<p>a <i>b</i></p>',
            'comment' => 'a<!-- c -->b',
            'script tag' => 'a<script>alert(1)</script>b',
            'html entity numeric' => '&#8212; &#x3B1;',
            'uppercase tag' => '<I>x</I>',
            'unclosed i' => '<i>open',
            'only whitespace' => '   ',
            'p lt space' => 'p < 0.05 in n<50 trials', 'lt digit' => 'n<50', 'lt eq' => 'a <= b', 'gt' => 'a > b',
            'zero' => '0',
            'head-ish text' => '<title>t</title> rest',
            'meta tag' => '<meta charset="latin1">é',
        ];
        foreach ($cases as $name => $html) {
            $doc = new DOMDocument('1.0', 'utf-8');
            $node = $doc->createElementNS('http://www.crossref.org/schema/5.3.1', 'title');
            $doc->appendChild($node);
            $filter->appendFaceMarkup($doc, $node, $html);
            $xml = preg_replace('/^<title[^>]*>|<\/title>$/', '', $doc->saveXML($node));
            fwrite(STDERR, sprintf("%-28s %s  =>  %s\n", $name, json_encode($html, JSON_UNESCAPED_UNICODE), $xml));
        }
        $this->assertTrue(true);
    }
}
