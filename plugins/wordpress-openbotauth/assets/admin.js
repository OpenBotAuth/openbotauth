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
            const $btn = $(this);
            const originalText = $btn.text();
            
            $btn.prop('disabled', true).text('Sending...');
            
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
                        const data = response.data;
                        let statusText = 'Just now';
                        if (data.last_status) {
                            const color = data.last_status === '200' ? '#00a32a' : '#d63638';
                            statusText += ' <span style="color: ' + color + ';">(' + data.last_status + ')</span>';
                        }
                        $('#openbotauth-telemetry-last-sent').html(statusText);
                        alert('Telemetry sent successfully!');
                    } else {
                        alert('Error: ' + (response.data || 'Unknown error'));
                    }
                },
                error: function() {
                    alert('Error sending telemetry. Please try again.');
                },
                complete: function() {
                    $btn.prop('disabled', false).text(originalText);
                }
            });
        });
    });
    
})(jQuery);

