/**
 * OpenBotAuth Admin JavaScript
 */
(function($) {
    'use strict';
    
    $(document).ready(function() {
        
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
        
        // Telemetry: toggle "Send now" button based on checkbox state
        $('#openbotauth_share_telemetry').on('change', function() {
            $('#openbotauth-send-telemetry-now').prop('disabled', !this.checked);
        });
        
        // Telemetry: "Send now" button handler
        $('#openbotauth-send-telemetry-now').on('click', function() {
            var $btn = $(this);
            var $status = $('#openbotauth-telemetry-status-message');
            var originalText = $btn.text();
            var i18n = openbotauth.i18n || {};
            
            $btn.prop('disabled', true).text(i18n.sending || 'Sending...');
            $status.html('').removeClass('notice-success notice-error');
            
            $.ajax({
                url: openbotauth.ajax_url,
                type: 'POST',
                data: {
                    action: 'openbotauth_send_telemetry_now',
                    nonce: openbotauth.nonce
                },
                success: function(response) {
                    if (response.success) {
                        // Update last sent display
                        var data = response.data;
                        var statusText = i18n.just_now || 'Just now';
                        if (data.last_status) {
                            var color = data.last_status === '200' ? '#00a32a' : '#d63638';
                            statusText += ' <span style="color: ' + color + ';">(' + data.last_status + ')</span>';
                        }
                        $('#openbotauth-telemetry-last-sent').html(statusText);
                        $status.html('<span style="color: #00a32a;">✓ ' + (i18n.sent_success || 'Sent successfully') + '</span>');
                    } else {
                        $status.html('<span style="color: #d63638;">✗ ' + (response.data || i18n.error || 'Error') + '</span>');
                    }
                },
                error: function() {
                    $status.html('<span style="color: #d63638;">✗ ' + (i18n.send_error || 'Error sending. Please try again.') + '</span>');
                },
                complete: function() {
                    // Re-enable only if checkbox is still checked
                    var isChecked = $('#openbotauth_share_telemetry').prop('checked');
                    $btn.prop('disabled', !isChecked).text(originalText);
                }
            });
        });
    });
    
})(jQuery);

