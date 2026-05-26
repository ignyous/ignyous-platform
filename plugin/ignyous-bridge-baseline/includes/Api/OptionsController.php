<?php
namespace Ignyous\Baseline\Api;

use Ignyous\Baseline\Auth;
use Ignyous\Baseline\Snapshots;
use Ignyous\Baseline\ActionLog;

/**
 * Whitelisted site options. Each entry maps the platform-facing key
 * to the underlying WP option name and a label for the action log.
 */
class OptionsController {

    const WHITELIST = [
        'site_title' => ['option' => 'blogname',     'label' => 'Site title'],
        'tagline'    => ['option' => 'blogdescription', 'label' => 'Tagline'],
    ];

    public function register(): void {
        register_rest_route('ignyous/v1', '/options', [
            [
                'methods'             => 'GET',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'get'],
            ],
            [
                'methods'             => 'PATCH',
                'permission_callback' => [Auth::class, 'check'],
                'callback'            => [$this, 'patch'],
            ],
        ]);
    }

    public function get(): \WP_REST_Response {
        $out = [];
        foreach (self::WHITELIST as $key => $meta) {
            $out[$key] = get_option($meta['option']);
        }
        return new \WP_REST_Response($out);
    }

    public function patch(\WP_REST_Request $req) {
        $changeId = Auth::changeId($req);
        $body     = $req->get_json_params() ?: [];
        $started  = microtime(true);

        $updates = [];
        $snapshotIds = [];
        $errors  = [];

        foreach ($body as $key => $value) {
            if (!isset(self::WHITELIST[$key])) {
                $errors[$key] = 'not_whitelisted';
                continue;
            }
            $optionName = self::WHITELIST[$key]['option'];
            $before     = get_option($optionName);
            $value      = is_string($value) ? sanitize_text_field($value) : $value;

            $snapId = Snapshots::open($changeId, 'option', $optionName, $before, self::WHITELIST[$key]['label']);
            $ok     = update_option($optionName, $value);
            // update_option returns false if value didn't change — that's not an error
            $after  = get_option($optionName);
            Snapshots::close($snapId, $after);

            $updates[$key]     = ['before' => $before, 'after' => $after, 'changed' => $before !== $after];
            $snapshotIds[$key] = $snapId;
        }

        $success = empty($errors);
        ActionLog::record([
            'change_id'     => $changeId,
            'intent_raw'    => Auth::intentRaw($req),
            'intent_parsed' => $body,
            'capability'    => 'options.patch',
            'request'       => ['body' => $body],
            'response'      => ['updates' => $updates, 'errors' => $errors, 'snapshot_ids' => $snapshotIds],
            'success'       => $success ? 1 : 0,
            'error'         => $success ? null : wp_json_encode($errors),
            'duration_ms'   => (int) round((microtime(true) - $started) * 1000),
            'ai_tokens'     => Auth::aiTokens($req),
        ]);

        return new \WP_REST_Response([
            'success'      => $success,
            'change_id'    => $changeId,
            'updates'      => $updates,
            'errors'       => (object) $errors,
            'snapshot_ids' => $snapshotIds,
        ], $success ? 200 : 400);
    }
}
