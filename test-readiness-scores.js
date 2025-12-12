/**
 * Test script for readiness score generation across all 3 personas
 * Run: node test-readiness-scores.js
 */

const http = require('http');

const SERVER_URL = 'http://localhost:3000';
const ENDPOINT = '/assess';

// Test data for Prospect persona
const prospectTestData = {
    user_type: 'prospect',
    prospect_section_1_basics: {
        company_name: 'Test Company Inc',
        industry: 'Technology',
        user_count: '50-100'
    },
    prospect_section_2_scope_clarity: {
        modules_interested: ['Template Setup', 'Assisted Workflows'],
        assisted_workflows: 'Yes',
        contract_templates: 'Yes, all available',
        assisted_migration: 'Yes',
        legacy_contracts: 'Yes, all available'
    },
    prospect_section_3_systems_integrations: {
        systems_used: ['Salesforce', 'Slack'],
        api_access: 'Yes'
    },
    prospect_section_4_timeline_readiness: {
        go_live_timeline: '3-6 months',
        biggest_concern: 'Integration complexity'
    },
    prospect_section_5_additional_context: {
        internal_bottlenecks: 'Legal review process',
        compliance_deadlines: 'Q2 2024',
        past_clm_experience: 'First time using CLM'
    }
};

// Test data for Customer persona
const customerTestData = {
    user_type: 'customer',
    customer_section_1_stakeholders: {
        primary_contact_name: 'John Doe',
        primary_contact_role: 'Legal Operations Manager',
        technical_contact_name: 'Jane Smith',
        technical_contact_role: 'IT Manager',
        team_distribution: ['Legal', 'Sales'],
        decision_approver: 'CFO'
    },
    customer_section_2_purchased_scope: {
        purchased_modules: ['Template Setup', 'Migration', 'Integrations'],
        template_count: '10-20',
        template_readiness: 'Ready'
    },
    customer_section_3_migration: {
        migration_needed: 'Yes',
        migration_contract_count: '1000-5000',
        contract_storage: 'SharePoint',
        data_cleanliness: 'Mostly clean'
    },
    customer_section_4_integrations: {
        integration_systems: ['Salesforce', 'DocuSign'],
        api_access: 'Yes',
        webhooks_support: 'Yes'
    },
    customer_section_5_business_processes: {
        approval_complexity: 'Moderate',
        agreement_signers: '2-5'
    },
    customer_section_6_security_access: {
        sso_required: 'Yes',
        security_needs: 'Yes',
        dpa_status: 'Signed'
    },
    customer_section_7_uploads: {
        templates: [],
        sample_contracts: []
    }
};

// Test data for Implementation Manager persona
const imTestData = {
    user_type: 'implementation_manager',
    im_section_1_customer_context: {
        customer_name: 'Enterprise Corp',
        package: 'Enterprise',
        complexity: 'High',
        known_risks: ['Security review pending', 'Template finalization']
    },
    im_section_2_scope_deliverables: {
        template_count: '20-50',
        workflow_complexity: 'Complex',
        custom_development: 'Yes',
        custom_development_details: 'Custom approval workflows and reporting dashboards'
    },
    im_section_3_migration_details: {
        csv_migration_required: 'Yes',
        assisted_migration: 'Yes',
        metadata_type: 'Structured',
        migration_volume: '5000-10000'
    },
    im_section_4_integrations: {
        integration_types: ['Salesforce', 'DocuSign', 'Slack'],
        integration_engineering_effort: 'High',
        integration_uat_rounds: '2-3',
        pre_known_blockers: 'API access pending approval'
    },
    im_section_5_timeline_expectations: {
        go_live_expectation: '8-12 weeks',
        known_blockers: 'Security review completion, template finalization'
    }
};

/**
 * Make HTTP POST request to test endpoint
 */
function makeRequest(persona, testData) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify({
            intake_responses: testData
        });

        const options = {
            hostname: 'localhost',
            port: 3000,
            path: ENDPOINT,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            },
            timeout: 120000 // 2 minutes timeout for AI processing
        };

        const req = http.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    resolve({ statusCode: res.statusCode, data: response, rawData: data });
                } catch (e) {
                    reject(new Error(`Failed to parse response: ${e.message}\nResponse: ${data}`));
                }
            });
        });

        req.on('error', (error) => {
            reject(error);
        });

        req.on('timeout', () => {
            req.destroy();
            reject(new Error('Request timeout'));
        });

        req.write(postData);
        req.end();
    });
}

/**
 * Validate readiness score response
 */
function validateResponse(persona, response) {
    const errors = [];
    const warnings = [];

    if (!response.success) {
        errors.push(`Request failed: ${response.error || 'Unknown error'}`);
        return { valid: false, errors, warnings };
    }

    // The response structure has data nested under 'data' property
    const assessmentData = response.data || response;

    // Check for readiness_score
    if (!assessmentData.readiness_score) {
        errors.push('Missing readiness_score in response');
    } else {
        // Validate overall score
        if (typeof assessmentData.readiness_score.overall !== 'number') {
            errors.push('readiness_score.overall is not a number');
        } else if (assessmentData.readiness_score.overall < 0 || assessmentData.readiness_score.overall > 100) {
            errors.push(`readiness_score.overall is out of range: ${assessmentData.readiness_score.overall}`);
        }

        // Validate breakdown
        if (!assessmentData.readiness_score.breakdown) {
            errors.push('Missing readiness_score.breakdown');
        } else {
            // Check persona-specific sections
            const breakdown = assessmentData.readiness_score.breakdown;
            
            if (persona === 'prospect') {
                // Note: The prompt only expects 4 sections (additional_context is calculated but not in breakdown)
                const expectedSections = ['basics', 'scope_clarity', 'systems_integrations', 'timeline_readiness'];
                expectedSections.forEach(section => {
                    if (!(section in breakdown)) {
                        warnings.push(`Missing section in breakdown: ${section}`);
                    } else if (typeof breakdown[section] !== 'number' || breakdown[section] < 0 || breakdown[section] > 100) {
                        errors.push(`Invalid breakdown.${section}: ${breakdown[section]}`);
                    }
                });
            } else if (persona === 'customer') {
                const expectedSections = ['stakeholders', 'purchased_scope', 'migration', 'integrations', 'business_processes', 'security_access', 'uploads'];
                expectedSections.forEach(section => {
                    if (!(section in breakdown)) {
                        warnings.push(`Missing section in breakdown: ${section}`);
                    } else if (typeof breakdown[section] !== 'number' || breakdown[section] < 0 || breakdown[section] > 100) {
                        errors.push(`Invalid breakdown.${section}: ${breakdown[section]}`);
                    }
                });
            } else if (persona === 'implementation_manager') {
                const expectedSections = ['customer_context', 'scope_deliverables', 'migration_details', 'integrations', 'timeline_expectations'];
                expectedSections.forEach(section => {
                    if (!(section in breakdown)) {
                        warnings.push(`Missing section in breakdown: ${section}`);
                    } else if (typeof breakdown[section] !== 'number' || breakdown[section] < 0 || breakdown[section] > 100) {
                        errors.push(`Invalid breakdown.${section}: ${breakdown[section]}`);
                    }
                });
            }
        }
    }

    // Check for status_label
    if (!assessmentData.status_label) {
        warnings.push('Missing status_label in response');
    }

    // Check for status_description
    if (!assessmentData.status_description) {
        warnings.push('Missing status_description in response');
    }

    // Check for red_flags (should be an array)
    if (!Array.isArray(assessmentData.red_flags)) {
        warnings.push('red_flags is not an array');
    }

    // Check for action_items
    if (!assessmentData.action_items) {
        warnings.push('Missing action_items in response');
    }

    // Check for ai_insights
    if (!assessmentData.ai_insights) {
        warnings.push('Missing ai_insights in response');
    }

    return {
        valid: errors.length === 0,
        errors,
        warnings
    };
}

/**
 * Display test results
 */
function displayResults(persona, result, validation) {
    console.log('\n' + '='.repeat(80));
    console.log(`TEST RESULTS: ${persona.toUpperCase()} PERSONA`);
    console.log('='.repeat(80));
    
    if (result.statusCode !== 200) {
        console.log(`❌ HTTP Status: ${result.statusCode}`);
        console.log(`Error: ${JSON.stringify(result.data, null, 2)}`);
        return;
    }

    // Extract assessment data (nested under 'data' property)
    const assessmentData = result.data.data || result.data;
    
    // Debug: Show actual response structure if validation fails
    if (!validation.valid || !assessmentData.readiness_score) {
        console.log('\n🔍 DEBUG - Actual Response Structure:');
        console.log(JSON.stringify(result.data, null, 2).substring(0, 2000));
        if (result.rawData && result.rawData.length > 2000) {
            console.log('... (truncated)');
        }
    }

    if (!validation.valid) {
        console.log('❌ VALIDATION FAILED');
        validation.errors.forEach(err => console.log(`  ❌ ${err}`));
    } else {
        console.log('✅ VALIDATION PASSED');
    }

    if (validation.warnings.length > 0) {
        console.log('\n⚠️  WARNINGS:');
        validation.warnings.forEach(warn => console.log(`  ⚠️  ${warn}`));
    }
    if (result.data.success && assessmentData.readiness_score) {
        console.log('\n📊 READINESS SCORE:');
        console.log(`  Overall Score: ${assessmentData.readiness_score.overall}/100`);
        console.log('\n  Breakdown:');
        Object.entries(assessmentData.readiness_score.breakdown || {}).forEach(([section, score]) => {
            const bar = '█'.repeat(Math.floor(score / 5));
            console.log(`    ${section.padEnd(30)}: ${String(score).padStart(3)}/100 ${bar}`);
        });

        if (assessmentData.status_label) {
            console.log(`\n📋 Status: ${assessmentData.status_label}`);
        }
        if (assessmentData.status_description) {
            console.log(`   ${assessmentData.status_description}`);
        }

        if (assessmentData.red_flags && assessmentData.red_flags.length > 0) {
            console.log(`\n🚩 Red Flags: ${assessmentData.red_flags.length}`);
            assessmentData.red_flags.slice(0, 3).forEach((flag, idx) => {
                console.log(`   ${idx + 1}. [${flag.severity || 'N/A'}] ${flag.issue || flag.section}`);
            });
        }

        if (assessmentData.ai_insights) {
            console.log('\n💡 AI Insights:');
            if (assessmentData.ai_insights.key_strengths) {
                console.log('  Strengths:');
                assessmentData.ai_insights.key_strengths.slice(0, 2).forEach(strength => {
                    console.log(`    • ${strength}`);
                });
            }
            if (assessmentData.ai_insights.critical_concerns) {
                console.log('  Concerns:');
                assessmentData.ai_insights.critical_concerns.slice(0, 2).forEach(concern => {
                    console.log(`    • ${concern}`);
                });
            }
        }
    }

    console.log('\n' + '='.repeat(80));
}

/**
 * Main test function
 */
async function runTests() {
    console.log('🧪 Testing Readiness Score Generation for All 3 Personas');
    console.log(`📍 Server: ${SERVER_URL}${ENDPOINT}`);
    console.log('\n⏳ Starting tests...\n');

    const personas = [
        { name: 'prospect', data: prospectTestData },
        { name: 'customer', data: customerTestData },
        { name: 'implementation_manager', data: imTestData }
    ];

    const results = [];

    for (const persona of personas) {
        try {
            console.log(`\n🔄 Testing ${persona.name} persona...`);
            const startTime = Date.now();
            
            const result = await makeRequest(persona.name, persona.data);
            const duration = Date.now() - startTime;
            
            const validation = validateResponse(persona.name, result.data);
            displayResults(persona.name, result, validation);
            
            const assessmentData = result.data.data || result.data;
            results.push({
                persona: persona.name,
                success: validation.valid && result.statusCode === 200,
                duration: `${(duration / 1000).toFixed(2)}s`,
                overallScore: assessmentData.readiness_score?.overall,
                errors: validation.errors,
                warnings: validation.warnings
            });

            // Small delay between requests
            await new Promise(resolve => setTimeout(resolve, 1000));
        } catch (error) {
            console.error(`\n❌ Error testing ${persona.name}:`, error.message);
            results.push({
                persona: persona.name,
                success: false,
                error: error.message
            });
        }
    }

    // Summary
    console.log('\n\n' + '='.repeat(80));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(80));
    
    results.forEach(result => {
        const icon = result.success ? '✅' : '❌';
        console.log(`${icon} ${result.persona.padEnd(25)} ${result.success ? `Score: ${result.overallScore || 'N/A'}` : `Error: ${result.error || 'Failed'}`} ${result.duration ? `(${result.duration})` : ''}`);
        if (result.errors && result.errors.length > 0) {
            result.errors.forEach(err => console.log(`   ❌ ${err}`));
        }
    });

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;
    
    console.log(`\n✅ Passed: ${successCount}/${totalCount}`);
    
    if (successCount === totalCount) {
        console.log('\n🎉 All tests passed!');
        process.exit(0);
    } else {
        console.log('\n⚠️  Some tests failed. Please review the errors above.');
        process.exit(1);
    }
}

// Run tests
runTests().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
});
