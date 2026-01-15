/**
 * OpenBotAuth Admin JavaScript
 */
(function($) {
    'use strict';

    $(document).ready(function() {

        // ========================================
        // Policy JSON Editor (Settings Page)
        // ========================================

        // Save policy JSON
        $('#openbotauth-save-policy').on('click', function() {
            const policyJson = $('#openbotauth-policy-json').val();

            // Validate JSON first
            try {
                JSON.parse(policyJson);
            } catch (e) {
                alert('Invalid JSON: ' + e.message);
                return;
            }

            // Save via AJAX
            $.ajax({
                url: openbotauth.ajax_url,
                type: 'POST',
                data: {
                    action: 'openbotauth_save_policy',
                    nonce: openbotauth.nonce,
                    policy: policyJson
                },
                success: function(response) {
                    if (response.success) {
                        alert('Policy saved successfully!');
                    } else {
                        alert('Error saving policy: ' + (response.data || 'Unknown error'));
                    }
                },
                error: function() {
                    alert('Error saving policy. Please try again.');
                }
            });
        });

        // Validate JSON
        $('#openbotauth-validate-policy').on('click', function() {
            const policyJson = $('#openbotauth-policy-json').val();

            try {
                const policy = JSON.parse(policyJson);

                // Basic validation
                if (!policy.default) {
                    alert('Warning: Policy should have a "default" key');
                    return;
                }

                const validEffects = ['allow', 'deny', 'teaser'];
                if (policy.default.effect && !validEffects.includes(policy.default.effect)) {
                    alert('Warning: Invalid effect "' + policy.default.effect + '". Should be: allow, deny, or teaser');
                    return;
                }

                alert('✓ JSON is valid!');
            } catch (e) {
                alert('Invalid JSON: ' + e.message);
            }
        });

        // Auto-format JSON on blur
        $('#openbotauth-policy-json').on('blur', function() {
            try {
                const policy = JSON.parse($(this).val());
                $(this).val(JSON.stringify(policy, null, 2));
            } catch (e) {
                // Ignore formatting errors
            }
        });

        // ========================================
        // Verifier URL Checkbox (Settings Page)
        // ========================================

        var $verifierCheckbox = $('#openbotauth_use_hosted_verifier');
        var $verifierUrlField = $('#openbotauth_verifier_url');

        if ($verifierCheckbox.length && $verifierUrlField.length && typeof openbotauth !== 'undefined' && openbotauth.hosted_url) {
            $verifierCheckbox.on('change', function() {
                if (this.checked) {
                    // Fill with hosted URL when checked
                    $verifierUrlField.val(openbotauth.hosted_url);
                } else {
                    // Clear the URL when unchecked
                    $verifierUrlField.val('');
                }
            });
        }

        // ========================================
        // Post Meta Box Toggle (Post Edit Page)
        // ========================================

        var $policyEnabledCheckbox = $('input[name="openbotauth_enabled"]');
        var $policyFields = $('#openbotauth-policy-fields');

        if ($policyEnabledCheckbox.length && $policyFields.length) {
            $policyEnabledCheckbox.on('change', function() {
                $policyFields.toggle(this.checked);
            });
        }
    });
})(jQuery);
