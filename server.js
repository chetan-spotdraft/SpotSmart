const express = require('express');
const cors = require('cors');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs').promises;
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Favicon handler (prevent 404 errors) - must be before static middleware
app.get('/favicon.ico', (req, res) => {
    res.status(204).end(); // No Content - prevents 404 error
});

// Serve static files (HTML, CSS, JS) from the root directory
app.use(express.static(__dirname));

// Serve the main HTML file at root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'spotsmart-complete.html'));
});

// Initialize Gemini AI
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
let genAI = null;
let geminiModel = null;

// Initialize Gemini AI (async initialization)
async function initializeGemini() {
    if (GEMINI_API_KEY) {
        try {
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
            
            // Use available models - optimized for accuracy and performance
            // Try these in order of preference (best accuracy first, then performance)
            const modelNames = [
                'gemini-2.5-pro',        // Best accuracy - latest pro model with advanced reasoning
                'gemini-pro-latest',     // Latest stable pro model - excellent accuracy
                'gemini-2.5-flash',      // Fast and accurate - good balance
                'gemini-2.0-flash',      // Alternative flash model
                'gemini-pro'             // Fallback
            ];
            let modelInitialized = false;
            let lastError = null;
            
            for (const modelName of modelNames) {
                try {
                    geminiModel = genAI.getGenerativeModel({ model: modelName });
                    // Test with a simple request (just 1 token to verify it works)
                    const testResult = await geminiModel.generateContent('Hi');
                    await testResult.response;
                    console.log(`✅ Gemini AI initialized successfully (using ${modelName})`);
                    modelInitialized = true;
                    break;
                } catch (modelError) {
                    lastError = modelError;
                    // Try next model
                    continue;
                }
            }
            
            if (!modelInitialized) {
                console.warn(`   Tried models: ${modelNames.join(', ')}`);
                throw new Error(`None of the Gemini models are available. Last error: ${lastError?.message || 'Unknown'}`);
            }
        } catch (error) {
            console.warn('⚠️  Failed to initialize Gemini AI:', error.message);
            console.warn('   Falling back to pattern matching extraction');
            geminiModel = null;
        }
    } else {
        console.warn('⚠️  GEMINI_API_KEY not found in environment variables');
        console.warn('   Using pattern matching extraction (add GEMINI_API_KEY to .env for AI-powered extraction)');
    }
}

// Initialize Gemini on startup (don't block server startup)
initializeGemini().catch(err => {
    console.error('Error initializing Gemini:', err);
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configure multer for file uploads
const upload = multer({ 
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// ============================================
// API 1: Parse Order Form
// ============================================
app.post('/parse-order-form', upload.single('file'), async (req, res) => {
    try {
        // Handle both file upload and base64 content
        let fileBuffer;
        let fileName;
        let fileType;

        if (req.file) {
            // Direct file upload
            fileBuffer = req.file.buffer;
            fileName = req.file.originalname;
            fileType = req.file.mimetype;
        } else if (req.body.file) {
            // Base64 encoded file
            const fileData = req.body.file;
            fileName = fileData.name || 'order-form.pdf';
            fileType = fileData.type || 'application/pdf';
            fileBuffer = Buffer.from(fileData.content, 'base64');
        } else {
            return res.status(400).json({
                success: false,
                error: 'No file provided. Please upload a file or provide base64 content.'
            });
        }

        // Validate file type
        const validTypes = [
            'application/pdf',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'application/msword'
        ];

        if (!validTypes.includes(fileType) && !fileName.match(/\.(pdf|docx|doc)$/i)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid file type. Please upload a PDF or DOCX file.'
            });
        }

        // Parse file content
        let textContent = '';
        
        try {
            if (fileType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')) {
                // Parse PDF
                console.log('Parsing PDF file...');
                const pdfData = await pdfParse(fileBuffer);
                textContent = pdfData.text;
                console.log(`Extracted ${textContent.length} characters from PDF`);
            } else if (fileType.includes('wordprocessingml') || fileName.toLowerCase().endsWith('.docx')) {
                // Parse DOCX
                console.log('Parsing DOCX file...');
                const result = await mammoth.extractRawText({ buffer: fileBuffer });
                textContent = result.value;
                console.log(`Extracted ${textContent.length} characters from DOCX`);
            } else {
                // Try to parse as DOCX anyway
                console.log('Attempting to parse as DOCX...');
                const result = await mammoth.extractRawText({ buffer: fileBuffer });
                textContent = result.value;
                console.log(`Extracted ${textContent.length} characters`);
            }
            
            if (!textContent || textContent.trim().length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Could not extract text from the document. The file might be empty, corrupted, or image-based (scanned PDF).'
                });
            }
        } catch (parseError) {
            console.error('Error parsing file:', parseError);
            return res.status(400).json({
                success: false,
                error: `Failed to parse document: ${parseError.message}. Please ensure it is a valid PDF or DOCX file.`
            });
        }

        // Extract data from order form
        // Use Gemini AI if available, otherwise fall back to pattern matching
        let extractedData;
        let confidence;
        
        // Ensure Gemini is initialized before using it
        if (GEMINI_API_KEY && !geminiModel) {
            console.log('Gemini not initialized yet, initializing now...');
            await initializeGemini();
        }
        
        if (geminiModel) {
            try {
                console.log('Attempting Gemini AI extraction...');
                extractedData = await extractOrderFormDataWithGemini(textContent, fileBuffer, fileType);
                confidence = 0.90; // High confidence for AI extraction
                console.log('✅ Gemini extraction successful');
            } catch (error) {
                console.error('Gemini extraction failed, falling back to pattern matching:', error.message);
                console.error('Error details:', error);
                extractedData = extractOrderFormData(textContent);
                confidence = calculateConfidence(extractedData, textContent);
            }
        } else {
            console.log('Using pattern matching extraction (Gemini not available)');
            extractedData = extractOrderFormData(textContent);
            confidence = calculateConfidence(extractedData, textContent);
        }
        
        const flags = generateFlags(extractedData, confidence);

        res.json({
            success: true,
            extracted_data: extractedData,
            confidence: confidence,
            flags: flags
        });

    } catch (error) {
        console.error('Error parsing order form:', error);
        console.error('Error stack:', error.stack);
        res.status(500).json({
            success: false,
            error: error.message || 'Failed to parse order form. Please try again or fill in the details manually.'
        });
    }
});

// ============================================
// API 2: Assess Readiness
// ============================================
app.post('/assess', async (req, res) => {
    try {
        const { intake_responses } = req.body;

        if (!intake_responses) {
            return res.status(400).json({
                success: false,
                error: 'Missing intake_responses in request body'
            });
        }

        // Use Gemini to calculate readiness scores and generate all assessment data
        let readinessScore = null;
        let redFlags = [];
        let actionItems = { customer: [], spotdraft: [] };
        let implementationPlan = null;
        let aiInsights = null;
        let geminiRequest = null;
        let geminiResponse = null;
        let statusLabel = 'Calculating...';
        let statusDescription = 'Analyzing your responses...';

        if (!geminiModel) {
            return res.status(500).json({
                success: false,
                error: 'Gemini AI is required for assessment calculation. Please ensure GEMINI_API_KEY is configured.'
            });
        }

        try {
            // Route to persona-specific assessment functions
            if (intake_responses.user_type === 'prospect') {
                // Prospect assessment (4 sections)
                const assessmentResult = await calculateProspectReadinessWithGemini(intake_responses);
                readinessScore = assessmentResult.readiness_score;
                redFlags = assessmentResult.red_flags;
                actionItems = assessmentResult.action_items;
                implementationPlan = assessmentResult.implementation_plan;
                aiInsights = assessmentResult.ai_insights;
                statusLabel = assessmentResult.status_label;
                statusDescription = assessmentResult.status_description;
                geminiRequest = assessmentResult.gemini_request;
                geminiResponse = assessmentResult.gemini_response;
                console.log('Prospect assessment completed successfully');
            } else if (intake_responses.user_type === 'customer') {
                // Customer assessment (7 sections)
                const assessmentResult = await calculateCustomerReadinessWithGemini(intake_responses);
                readinessScore = assessmentResult.readiness_score;
                redFlags = assessmentResult.red_flags;
                actionItems = assessmentResult.action_items;
                implementationPlan = assessmentResult.implementation_plan;
                aiInsights = assessmentResult.ai_insights;
                statusLabel = assessmentResult.status_label;
                statusDescription = assessmentResult.status_description;
                geminiRequest = assessmentResult.gemini_request;
                geminiResponse = assessmentResult.gemini_response;
                console.log('Customer assessment completed successfully');
            } else if (intake_responses.user_type === 'implementation_manager') {
                // IM assessment (6 sections) with rule-based plan generation
                const imPlan = createIMImplementationPlan(intake_responses);
                const imAssessment = await calculateIMReadinessWithGemini(intake_responses, imPlan);
                readinessScore = imAssessment.readiness_score;
                redFlags = imAssessment.red_flags;
                actionItems = imAssessment.action_items;
                implementationPlan = imPlan;
                aiInsights = imAssessment.ai_insights;
                statusLabel = imAssessment.status_label || 'Plan Generated';
                statusDescription = imAssessment.status_description || 'Rocketlane-ready implementation plan generated';
                geminiRequest = imAssessment.gemini_request;
                geminiResponse = imAssessment.gemini_response;
                console.log('IM assessment completed successfully');
            } else {
                // Fallback to standard assessment (for backward compatibility)
                const assessmentResult = await calculateReadinessWithGemini(intake_responses);
                readinessScore = assessmentResult.readiness_score;
                redFlags = assessmentResult.red_flags;
                actionItems = assessmentResult.action_items;
                implementationPlan = assessmentResult.implementation_plan;
                aiInsights = assessmentResult.ai_insights;
                statusLabel = assessmentResult.status_label;
                statusDescription = assessmentResult.status_description;
                geminiRequest = assessmentResult.gemini_request;
                geminiResponse = assessmentResult.gemini_response;
                console.log('Standard assessment completed successfully');
            }
        } catch (error) {
            console.error('Error calculating assessment with Gemini:', error);
            return res.status(500).json({
                success: false,
                error: `Failed to calculate assessment: ${error.message}`,
                gemini_request: geminiRequest || 'Error: Failed to generate prompt',
                gemini_response: geminiResponse || `Error: ${error.message}`
            });
        }

        const responseData = {
            readiness_score: readinessScore,
            status_label: statusLabel,
            status_description: statusDescription,
            red_flags: redFlags,
            action_items: actionItems,
            implementation_plan: implementationPlan,
            ai_insights: aiInsights,
            gemini_request: geminiRequest,
            gemini_response: geminiResponse
        };
        
        console.log('Assessment response prepared:', {
            overall_score: readinessScore?.overall,
            red_flags_count: redFlags?.length || 0,
            has_gemini_request: !!geminiRequest,
            has_gemini_response: !!geminiResponse,
            request_length: geminiRequest?.length || 0,
            response_length: geminiResponse?.length || 0
        });
        
        res.json({
            success: true,
            data: responseData
        });

    } catch (error) {
        console.error('Error assessing readiness:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to assess readiness. Please try again.'
        });
    }
});

// ============================================
// Helper Functions: Order Form Parsing
// ============================================

/**
 * Extract order form data using Google Gemini AI
 */
async function extractOrderFormDataWithGemini(textContent, fileBuffer, fileType) {
    // Ensure we have a working model - reinitialize if needed with a known working model
    if (!geminiModel || !genAI) {
        if (!GEMINI_API_KEY) {
            throw new Error('Gemini API key not configured');
        }
        if (!genAI) {
            genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        }
        // Always use gemini-2.5-flash which we know works
        geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        console.log('Reinitialized Gemini model with gemini-2.5-flash');
    }

    const prompt = `You are an expert at extracting structured data from order forms and contracts. 
Analyze the following document text and extract the following information in JSON format:

{
    "organisation_name": "extract the company/organization name",
    "purchased_modules": ["list of modules like Template Setup, Migration, Integrations"],
    "template_count": number or null,
    "migration_contract_count": number or null,
    "integration_systems": ["list of systems like Salesforce, HubSpot, DocuSign, etc."]
}

Rules:
- Only extract information that is explicitly stated in the document
- If information is not found, use null for numbers and empty array for lists
- For organisation_name, extract the full company name
- For purchased_modules, look for mentions of: Template Setup, Migration, Integrations, or similar module names
- For template_count, look for numbers associated with templates
- For migration_contract_count, look for numbers of contracts to be migrated
- For integration_systems, identify any third-party systems mentioned (Salesforce, HubSpot, DocuSign, SSO, Jira, Google Forms, Cloud Storage, etc.)

Document text:
${textContent}

Return ONLY valid JSON, no additional text or explanation.`;

    try {
        // Ensure we have a valid model - if not, try to get one
        if (!geminiModel && genAI) {
            geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
        }
        
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Extract JSON from response (handle markdown code blocks if present)
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').trim();
        }
        
        const extractedData = JSON.parse(jsonText);
        
        // Validate and normalize the data
        return {
            organisation_name: extractedData.organisation_name || '',
            purchased_modules: Array.isArray(extractedData.purchased_modules) ? extractedData.purchased_modules : [],
            template_count: extractedData.template_count ? parseInt(extractedData.template_count) : null,
            migration_contract_count: extractedData.migration_contract_count ? parseInt(extractedData.migration_contract_count) : null,
            integration_systems: Array.isArray(extractedData.integration_systems) ? extractedData.integration_systems : []
        };
    } catch (error) {
        console.error('Error in Gemini extraction:', error);
        // If it's a model error, try to reinitialize
        if (error.message && error.message.includes('not found')) {
            console.log('Attempting to reinitialize with gemini-2.5-flash...');
            if (genAI) {
                try {
                    geminiModel = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
                    // Retry once
                    const result = await geminiModel.generateContent(prompt);
                    const response = await result.response;
                    const text = response.text();
                    let jsonText = text.trim();
                    if (jsonText.startsWith('```json')) {
                        jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
                    } else if (jsonText.startsWith('```')) {
                        jsonText = jsonText.replace(/```\n?/g, '').trim();
                    }
                    const extractedData = JSON.parse(jsonText);
                    return {
                        organisation_name: extractedData.organisation_name || '',
                        purchased_modules: Array.isArray(extractedData.purchased_modules) ? extractedData.purchased_modules : [],
                        template_count: extractedData.template_count ? parseInt(extractedData.template_count) : null,
                        migration_contract_count: extractedData.migration_contract_count ? parseInt(extractedData.migration_contract_count) : null,
                        integration_systems: Array.isArray(extractedData.integration_systems) ? extractedData.integration_systems : []
                    };
                } catch (retryError) {
                    throw error; // Throw original error
                }
            }
        }
        throw error;
    }
}

function extractOrderFormData(text) {
    const data = {
        organisation_name: '',
        purchased_modules: [],
        template_count: null,
        migration_contract_count: null,
        integration_systems: []
    };

    // Extract organization name (look for common patterns)
    const orgPatterns = [
        /(?:company|organization|organisation|client|customer)[\s:]+([A-Z][A-Za-z\s&]+)/i,
        /(?:name|entity)[\s:]+([A-Z][A-Za-z\s&]+)/i
    ];
    
    for (const pattern of orgPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            data.organisation_name = match[1].trim();
            break;
        }
    }

    // Extract modules (look for module names)
    const moduleKeywords = {
        'Template Setup': ['template', 'template setup', 'template configuration'],
        'Migration': ['migration', 'data migration', 'contract migration', 'historical'],
        'Integrations': ['integration', 'integrate', 'api', 'webhook', 'connect']
    };

    for (const [module, keywords] of Object.entries(moduleKeywords)) {
        for (const keyword of keywords) {
            if (text.toLowerCase().includes(keyword.toLowerCase())) {
                if (!data.purchased_modules.includes(module)) {
                    data.purchased_modules.push(module);
                }
                break;
            }
        }
    }

    // Extract template count
    const templateMatch = text.match(/(?:template|templates)[\s:]+(?:count|number|quantity|qty)[\s:]*(\d+)/i);
    if (templateMatch) {
        data.template_count = parseInt(templateMatch[1]);
    } else {
        // Look for standalone numbers near "template"
        const templateNumMatch = text.match(/(\d+)[\s]*(?:template|templates)/i);
        if (templateNumMatch) {
            data.template_count = parseInt(templateNumMatch[1]);
        }
    }

    // Extract migration contract count
    const migrationMatch = text.match(/(?:migration|migrate|contracts?)[\s:]+(?:count|number|quantity|qty|of)[\s:]*(\d+)/i);
    if (migrationMatch) {
        data.migration_contract_count = parseInt(migrationMatch[1]);
    } else {
        const contractNumMatch = text.match(/(\d+)[\s]*(?:contracts?|documents?)[\s]*(?:to|for)[\s]*(?:migrate|migration)/i);
        if (contractNumMatch) {
            data.migration_contract_count = parseInt(contractNumMatch[1]);
        }
    }

    // Extract integration systems
    const integrationSystems = ['Salesforce', 'HubSpot', 'DocuSign', 'SSO', 'Jira', 'Google Forms', 'Cloud Storage'];
    for (const system of integrationSystems) {
        if (text.toLowerCase().includes(system.toLowerCase())) {
            data.integration_systems.push(system);
        }
    }

    return data;
}

function calculateConfidence(extractedData, textContent) {
    let confidence = 0.5; // Base confidence

    // Increase confidence based on extracted data
    if (extractedData.organisation_name) confidence += 0.1;
    if (extractedData.purchased_modules.length > 0) confidence += 0.15;
    if (extractedData.template_count) confidence += 0.1;
    if (extractedData.migration_contract_count) confidence += 0.1;
    if (extractedData.integration_systems.length > 0) confidence += 0.05;

    // Adjust based on text length (more content = potentially more reliable)
    if (textContent.length > 1000) confidence += 0.05;
    if (textContent.length < 200) confidence -= 0.1;

    return Math.min(0.98, Math.max(0.3, confidence));
}

function generateFlags(extractedData, confidence) {
    const flags = [];

    if (confidence < 0.7) {
        flags.push({
            type: 'warning',
            message: 'Low confidence in extracted data. Please verify the information below.'
        });
    }

    if (!extractedData.organisation_name) {
        flags.push({
            type: 'info',
            message: 'Organization name not found. Please enter manually.'
        });
    }

    if (extractedData.purchased_modules.length === 0) {
        flags.push({
            type: 'warning',
            message: 'No modules detected. Please select modules manually.'
        });
    }

    if (extractedData.template_count === null && extractedData.purchased_modules.includes('Template Setup')) {
        flags.push({
            type: 'warning',
            message: 'Template count not explicitly stated, estimated from context'
        });
    }

    return flags;
}

// ============================================
// Helper Functions: Readiness Assessment
// ============================================

function calculateReadinessScore(responses) {
    const scores = {
        account_stakeholder: 0,
        order_form_scope: 0,
        template_readiness: 0,
        migration_readiness: 0,
        integration_readiness: 0,
        business_process: 0,
        security_compliance: 0
    };

    // Section 1: Account & Stakeholder (max 100)
    const s1 = responses.section_1_account_stakeholder;
    if (s1.organisation_name) scores.account_stakeholder += 20;
    if (s1.primary_poc?.name && s1.primary_poc?.email) scores.account_stakeholder += 20;
    if (s1.legal_poc?.name && s1.legal_poc?.email) scores.account_stakeholder += 15;
    if (s1.technical_poc?.name && s1.technical_poc?.email) scores.account_stakeholder += 10;
    if (s1.availability) scores.account_stakeholder += 10;
    if (s1.communication_channels?.length > 0) scores.account_stakeholder += 10;
    if (s1.expected_go_live) scores.account_stakeholder += 15;

    // Section 2: Order Form Scope (max 100)
    const s2 = responses.section_2_order_form_scope;
    if (s2.order_form_uploaded) scores.order_form_scope += 30;
    if (s2.purchased_modules?.length > 0) scores.order_form_scope += 30;
    if (s2.template_count) scores.order_form_scope += 15;
    if (s2.migration_contract_count) scores.order_form_scope += 15;
    if (s2.additional_addons) scores.order_form_scope += 10;

    // Section 3: Template Readiness (max 100)
    const s3 = responses.section_3_template_readiness;
    if (s3.templates_finalized === 'Yes') scores.template_readiness += 30;
    else if (s3.templates_finalized === 'In review') scores.template_readiness += 20;
    if (s3.template_formats?.length > 0) scores.template_readiness += 15;
    if (s3.conditional_logic && s3.conditional_logic !== 'None') {
        if (s3.conditional_logic === 'Simple') scores.template_readiness += 10;
        else if (s3.conditional_logic === 'Moderate') scores.template_readiness += 5;
    }
    if (s3.dynamic_rendering_needed === 'Yes') {
        if (s3.dynamic_rendering_complexity === 'Simple') scores.template_readiness += 10;
        else if (s3.dynamic_rendering_complexity === 'Moderate') scores.template_readiness += 5;
    }
    if (!s3.clause_level_changes) scores.template_readiness += 10;
    if (s3.approval_matrices_exist) scores.template_readiness += 10;
    if (s3.template_count) scores.template_readiness += 10;

    // Section 4: Migration Readiness (max 100)
    const s4 = responses.section_4_migration_readiness;
    if (s4.contract_count) scores.migration_readiness += 20;
    if (s4.contract_types) scores.migration_readiness += 15;
    if (s4.structured_naming === 'Yes - 100%') scores.migration_readiness += 25;
    else if (s4.structured_naming === 'Partial') scores.migration_readiness += 15;
    if (s4.existing_metadata === 'Yes - fully') scores.migration_readiness += 20;
    else if (s4.existing_metadata === 'Yes - partially') scores.migration_readiness += 10;
    if (s4.excel_trackers) scores.migration_readiness += 10;
    if (s4.storage_locations?.length > 0) scores.migration_readiness += 10;

    // Section 5: Integration Readiness (max 100)
    const s5 = responses.section_5_integration_readiness;
    if (s5.systems_to_integrate?.length > 0) scores.integration_readiness += 25;
    if (s5.api_webhook_access) scores.integration_readiness += 20;
    if (s5.admin_access === 'Yes - all') scores.integration_readiness += 20;
    else if (s5.admin_access === 'Yes - some') scores.integration_readiness += 10;
    if (s5.decision_maker?.name && s5.decision_maker?.email) scores.integration_readiness += 15;
    if (s5.expected_outcomes?.length > 0) scores.integration_readiness += 10;
    if (s5.security_approval === 'No') scores.integration_readiness += 10;

    // Section 6: Business Process (max 100)
    const s6 = responses.section_6_business_process;
    if (s6.approval_workflow === 'Yes - documented') scores.business_process += 30;
    else if (s6.approval_workflow === 'Yes - informal') scores.business_process += 20;
    if (s6.contracts_per_month) scores.business_process += 15;
    if (s6.contract_generators?.length > 0) scores.business_process += 15;
    if (s6.bottlenecks) scores.business_process += 10;
    if (s6.phase1_must_haves) scores.business_process += 15;
    if (s6.workflow_details) scores.business_process += 15;

    // Section 7: Security & Compliance (max 100)
    const s7 = responses.section_7_security_compliance;
    if (s7.security_review === 'Completed') scores.security_compliance += 30;
    else if (s7.security_review === 'No') scores.security_compliance += 20;
    if (s7.infosec_approvals === 'No') scores.security_compliance += 20;
    if (s7.data_residency === 'No') scores.security_compliance += 20;
    if (s7.custom_sso === 'No') scores.security_compliance += 15;
    if (s7.security_reviews_needed?.length > 0 && s7.security_review === 'Yes') {
        scores.security_compliance -= 10; // Pending reviews reduce score
    }

    // Calculate overall score (weighted average)
    const weights = {
        account_stakeholder: 0.15,
        order_form_scope: 0.15,
        template_readiness: 0.20,
        migration_readiness: 0.15,
        integration_readiness: 0.15,
        business_process: 0.10,
        security_compliance: 0.10
    };

    let overall = 0;
    for (const [key, score] of Object.entries(scores)) {
        overall += score * weights[key];
    }

    return {
        overall: Math.round(overall),
        breakdown: scores
    };
}

function identifyRedFlags(responses) {
    const flags = [];

    // Security blockers
    const s7 = responses.section_7_security_compliance;
    if (s7.security_review === 'Yes' && (!s7.security_reviews_needed || s7.security_reviews_needed.length === 0)) {
        flags.push({
            section: 'Security & Compliance',
            issue: 'Security review required but reviews not specified',
            impact: 'May delay go-live by 2-4 weeks',
            severity: 'high'
        });
    }
    if (s7.infosec_approvals === 'Yes' && !s7.infosec_details) {
        flags.push({
            section: 'Security & Compliance',
            issue: 'Infosec approvals pending',
            impact: 'May delay go-live by 1-3 weeks',
            severity: 'medium'
        });
    }

    // Template readiness
    const s3 = responses.section_3_template_readiness;
    if (s3.templates_finalized === 'No') {
        flags.push({
            section: 'Template Readiness',
            issue: 'Templates not finalized',
            impact: 'Will delay template setup phase by 2-4 weeks',
            severity: 'high'
        });
    }
    if (s3.conditional_logic === 'Complex' || s3.dynamic_rendering_complexity === 'Complex') {
        flags.push({
            section: 'Template Readiness',
            issue: 'Complex conditional logic or dynamic rendering',
            impact: 'May require additional development time',
            severity: 'medium'
        });
    }

    // Integration blockers
    const s5 = responses.section_5_integration_readiness;
    if (s5.systems_to_integrate?.length > 0 && s5.admin_access === 'No') {
        flags.push({
            section: 'Integration Readiness',
            issue: 'No admin access for required integrations',
            impact: 'Will block integration setup',
            severity: 'high'
        });
    }
    if (s5.security_approval === 'Yes' && !s5.decision_maker?.email) {
        flags.push({
            section: 'Integration Readiness',
            issue: 'IT approval needed but decision maker not identified',
            impact: 'May delay integration setup',
            severity: 'medium'
        });
    }

    // Migration readiness
    const s4 = responses.section_4_migration_readiness;
    if (s4.structured_naming === 'None') {
        flags.push({
            section: 'Migration Readiness',
            issue: 'Unstructured contract naming',
            impact: 'Will increase migration time and complexity',
            severity: 'medium'
        });
    }
    if (s4.existing_metadata === 'No' && s4.contract_count > 1000) {
        flags.push({
            section: 'Migration Readiness',
            issue: 'Large migration volume without existing metadata',
            impact: 'Will require significant manual work or AI extraction',
            severity: 'high'
        });
    }

    return flags;
}

function generateActionItems(responses, redFlags) {
    const customerActions = [];
    const spotdraftActions = [];

    // Customer actions based on red flags
    redFlags.forEach((flag, index) => {
        if (flag.severity === 'high') {
            customerActions.push({
                task: `Address: ${flag.issue}`,
                section: flag.section,
                priority: 'high',
                deadline: 'ASAP',
                owner: 'Customer Team'
            });
        }
    });

    // Template-related actions
    const s3 = responses.section_3_template_readiness;
    if (s3.templates_finalized === 'No') {
        customerActions.push({
            task: 'Finalize contract templates',
            section: 'Template Readiness',
            priority: 'high',
            deadline: 'Before template setup phase',
            owner: 'Legal Team'
        });
    }

    // Security-related actions
    const s7 = responses.section_7_security_compliance;
    if (s7.security_review === 'Yes') {
        customerActions.push({
            task: 'Complete security reviews',
            section: 'Security & Compliance',
            priority: 'high',
            deadline: 'Before go-live',
            owner: 'IT/Security Team'
        });
    }

    // SpotDraft actions
    spotdraftActions.push({
        task: 'Schedule kickoff meeting',
        section: 'Project Setup',
        priority: 'high',
        deadline: 'Within 1 week',
        owner: 'Implementation Team'
    });

    if (s3.templates_finalized === 'Yes') {
        spotdraftActions.push({
            task: 'Schedule template review session',
            section: 'Template Readiness',
            priority: 'medium',
            deadline: 'Within 2 weeks',
            owner: 'Implementation Team'
        });
    }

    if (responses.section_5_integration_readiness?.systems_to_integrate?.length > 0) {
        spotdraftActions.push({
            task: 'Schedule integration planning session',
            section: 'Integration Readiness',
            priority: 'medium',
            deadline: 'Within 2 weeks',
            owner: 'Integration Team'
        });
    }

    return {
        customer: customerActions,
        spotdraft: spotdraftActions
    };
}

/**
 * Create Rocketlane-ready implementation plan for IM persona using rule-based logic
 */
function createIMImplementationPlan(responses) {
    const planLogic = {
        complexity: {
            low: { duration_multiplier: 0.8, extra_tasks: [] },
            medium: { duration_multiplier: 1.0, extra_tasks: [] },
            high: {
                duration_multiplier: 1.3,
                extra_tasks: [{
                    phase: "Kickoff & Scoping",
                    task: "Additional alignment touchpoint",
                    duration_hours: 1,
                    assignee: "PM"
                }]
            }
        },
        risks: {
            low_responsiveness: {
                phase: "Weekly Client Engagement",
                task: "Set weekly cadence with customer",
                duration_hours: 0.5,
                assignee: "PM"
            },
            template_unready: {
                phase: "Template Automation",
                task: "Template readiness workshop",
                duration_hours: 2,
                assignee: "PM"
            },
            technical_owner_missing: {
                phase: "Kickoff & Scoping",
                task: "Identify technical owner",
                duration_hours: 1,
                assignee: "PM"
            },
            security_review_delays: {
                phase: "Pre-Onboarding",
                task: "Security review & questionnaire",
                duration_hours: 2,
                assignee: "Security"
            },
            integration_unclear: {
                phase: "Integrations",
                task: "Integration discovery session",
                duration_hours: 1,
                assignee: "PM"
            }
        },
        template_volume: {
            small: { extra_tasks: [] },
            medium: {
                extra_tasks: [{
                    phase: "Template Automation",
                    task: "Additional placeholder mapping session",
                    duration_hours: 2,
                    assignee: "Implementation Engineer"
                }]
            },
            large: {
                extra_tasks: [
                    {
                        phase: "Template Automation",
                        task: "Batch template intake session",
                        duration_hours: 3,
                        assignee: "PM"
                    },
                    {
                        phase: "Template Automation",
                        task: "Template prioritisation exercise",
                        duration_hours: 2,
                        assignee: "PM"
                    }
                ]
            }
        },
        workflow_complexity: {
            simple: { tasks_to_add: [] },
            medium: {
                tasks_to_add: [{
                    phase: "Configuration",
                    task: "Configure conditional routing",
                    duration_hours: 2,
                    assignee: "Implementation Engineer"
                }]
            },
            complex: {
                tasks_to_add: [
                    {
                        phase: "Configuration",
                        task: "Configure cross-functional workflows",
                        duration_hours: 3,
                        assignee: "Implementation Engineer"
                    },
                    {
                        phase: "Configuration",
                        task: "Setup multi-level escalations",
                        duration_hours: 2,
                        assignee: "Implementation Engineer"
                    }
                ]
            }
        },
        custom_development: {
            yes: {
                new_phase: {
                    title: "Custom Development",
                    tasks: [
                        { task: "Scope custom requirements", duration_hours: 2, assignee: "PM" },
                        { task: "Engineering handoff", duration_hours: 1, assignee: "Engineering" },
                        { task: "Custom build UAT", duration_hours: 2, assignee: "PM" },
                        { task: "Deploy custom feature", duration_hours: 1, assignee: "Engineering" }
                    ]
                }
            },
            no: { new_phase: null }
        },
        migration_engineering_needed: {
            yes: {
                tasks: [
                    { phase: "Migration", task: "Migration schema validation", duration_hours: 2, assignee: "Engineering" },
                    { phase: "Migration", task: "Engineering-assisted import", duration_hours: 3, assignee: "Engineering" },
                    { phase: "Migration", task: "Post-import data verification", duration_hours: 2, assignee: "PM" }
                ],
                extend_uat_hours: 2
            },
            no: { tasks: [], extend_uat_hours: 0 }
        },
        migration_volume: {
            none: { hide_migration_phase: true, extra_tasks: [] },
            small: { hide_migration_phase: false, extra_tasks: [] },
            medium: {
                hide_migration_phase: false,
                extra_tasks: [{
                    phase: "Migration",
                    task: "Sample import test",
                    duration_hours: 2,
                    assignee: "PM"
                }]
            },
            large: {
                hide_migration_phase: false,
                extra_tasks: [
                    { phase: "Migration", task: "Phased migration planning", duration_hours: 3, assignee: "PM" },
                    { phase: "Migration", task: "Parallel migration execution", duration_hours: 4, assignee: "Engineering" }
                ]
            }
        },
        integrations: {
            crm: [
                { phase: "Integrations", task: "Field mapping workshop (CRM)", duration_hours: 2, assignee: "PM" },
                { phase: "Integrations", task: "CRM sandbox validation", duration_hours: 2, assignee: "Implementation Engineer" }
            ],
            cpq: [{
                phase: "Integrations",
                task: "CPQ sync feasibility check",
                duration_hours: 2,
                assignee: "Implementation Engineer"
            }],
            hris: [{
                phase: "Integrations",
                task: "Master data mapping workshop",
                duration_hours: 2,
                assignee: "PM"
            }],
            erp: [{
                phase: "Integrations",
                task: "ERP credential validation",
                duration_hours: 2,
                assignee: "Customer/IT"
            }],
            custom_api: [{
                phase: "Integrations",
                task: "Custom endpoint testing",
                duration_hours: 3,
                assignee: "Implementation Engineer"
            }]
        },
        integration_engineering_needed: {
            yes: [{
                phase: "Integrations",
                task: "Engineering review session for integrations",
                duration_hours: 2,
                assignee: "Engineering"
            }],
            no: []
        },
        internal_dependencies: {
            security: [{
                phase: "Pre-Onboarding",
                task: "Security review session",
                duration_hours: 1,
                assignee: "Security"
            }],
            legal: [{
                phase: "Pre-Onboarding",
                task: "DPA review",
                duration_hours: 1,
                assignee: "Legal"
            }],
            solutions_engineering: [{
                phase: "Kickoff & Scoping",
                task: "Technical discovery session",
                duration_hours: 1,
                assignee: "Solutions Engineering"
            }],
            engineering: [{
                phase: "Kickoff & Scoping",
                task: "Technical handoff and estimation",
                duration_hours: 2,
                assignee: "Engineering"
            }]
        },
        engineering_effort: {
            none: "No engineering dependency",
            "1_3_days": "Estimated engineering dependency: 1–3 days",
            "3_7_days": "Estimated engineering dependency: 3–7 days",
            "7_plus_days": "Estimated engineering dependency: 7 plus days"
        },
        go_live_expectation: {
            "4_6_weeks": { duration_multiplier: 0.9, extra_tasks: [] },
            "6_8_weeks": { duration_multiplier: 1.0, extra_tasks: [] },
            "8_12_weeks": {
                duration_multiplier: 1.1,
                extra_tasks: [{
                    phase: "Training",
                    task: "Extended UAT support",
                    duration_hours: 2,
                    assignee: "PM"
                }]
            },
            "12_plus_weeks": {
                duration_multiplier: 1.2,
                extra_tasks: [{
                    phase: "Kickoff & Scoping",
                    task: "Phased rollout planning",
                    duration_hours: 2,
                    assignee: "PM"
                }]
            }
        }
    };

    const im = responses.im_section_1_customer_context || {};
    const scope = responses.im_section_2_scope_deliverables || {};
    const migration = responses.im_section_3_migration_details || {};
    const integrations = responses.im_section_4_integrations || {};
    // Section 5 (Internal Dependencies) was removed - timeline is now section 5
    const timeline = responses.im_section_5_timeline_expectations || {};

    // Base phases structure - create standard phases first
    const phaseOrder = [
        "Pre-Onboarding",
        "Kickoff & Scoping",
        "Configuration",
        "Template Automation",
        "Integrations",
        "Migration",
        "Training",
        "Weekly Client Engagement"
    ];
    
    const phases = [];
    const phaseMap = {};

    // Initialize base phases
    phaseOrder.forEach((name, index) => {
        phaseMap[name] = {
            phase: index + 1,
            name: name,
            duration: "TBD",
            activities: [],
            dependencies: null,
            status: "Scheduled",
            internal_notes: null
        };
        phases.push(phaseMap[name]);
    });

    // Helper to get or create phase
    function getOrCreatePhase(name) {
        if (!phaseMap[name]) {
            const phaseNum = phases.length + 1;
            phaseMap[name] = {
                phase: phaseNum,
                name: name,
                duration: "TBD",
                activities: [],
                dependencies: null,
                status: "Scheduled",
                internal_notes: null
            };
            phases.push(phaseMap[name]);
        }
        return phaseMap[name];
    }

    // Helper to add task to phase
    function addTaskToPhase(phaseName, task, duration, assignee) {
        const phase = getOrCreatePhase(phaseName);
        phase.activities.push(`${task} (${assignee}, ${duration}h)`);
    }

    // 1. Apply complexity multiplier
    const complexity = (im.complexity || "medium").toLowerCase();
    const complexityConfig = planLogic.complexity[complexity] || planLogic.complexity.medium;
    if (complexityConfig.extra_tasks.length > 0) {
        complexityConfig.extra_tasks.forEach(t => {
            addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
        });
    }

    // 2. Add risk-based tasks
    const knownRisks = im.known_risks || [];
    knownRisks.forEach(risk => {
        const riskKey = risk.toLowerCase().replace(/\s+/g, '_')
            .replace('lack_of_template_readiness', 'template_unready')
            .replace('lack_of_technical_ownership', 'technical_owner_missing')
            .replace('security_review_delays', 'security_review_delays')
            .replace('integration_feasibility_unclear', 'integration_unclear');
        const riskConfig = planLogic.risks[riskKey];
        if (riskConfig) {
            addTaskToPhase(riskConfig.phase, riskConfig.task, riskConfig.duration_hours, riskConfig.assignee);
        }
    });

    // 3. Template volume tasks
    const templateCount = scope.template_count || "0-5";
    let templateVolume = "small";
    if (templateCount === "5-15") templateVolume = "medium";
    else if (templateCount === "15+") templateVolume = "large";
    const templateConfig = planLogic.template_volume[templateVolume] || planLogic.template_volume.small;
    templateConfig.extra_tasks.forEach(t => {
        addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
    });

    // 4. Workflow complexity tasks
    const workflowComplexity = (scope.workflow_complexity || "").toLowerCase();
    let workflowKey = "simple";
    if (workflowComplexity.includes("medium")) workflowKey = "medium";
    else if (workflowComplexity.includes("complex")) workflowKey = "complex";
    const workflowConfig = planLogic.workflow_complexity[workflowKey] || planLogic.workflow_complexity.simple;
    workflowConfig.tasks_to_add.forEach(t => {
        addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
    });

    // 5. Custom development phase
    if (scope.custom_development === "Yes" && scope.custom_development_details) {
        const customPhase = planLogic.custom_development.yes.new_phase;
        const phase = getOrCreatePhase(customPhase.title);
        customPhase.tasks.forEach(t => {
            phase.activities.push(`${t.task} (${t.assignee}, ${t.duration_hours}h)`);
        });
    }

    // 6. Migration tasks
    const migrationVolume = (migration.migration_volume || "none").toLowerCase();
    const migrationConfig = planLogic.migration_volume[migrationVolume] || planLogic.migration_volume.none;
    if (!migrationConfig.hide_migration_phase) {
        const migrationPhase = getOrCreatePhase("Migration");
        migrationConfig.extra_tasks.forEach(t => {
            addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
        });
        if (migration.csv_migration_required === "Yes") {
            planLogic.migration_engineering_needed.yes.tasks.forEach(t => {
                addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
            });
        }
    }

    // 7. Integration tasks
    const integrationTypes = integrations.integration_types || [];
    integrationTypes.forEach(type => {
        const typeKey = type.toLowerCase()
            .replace('crm (sfdc, hubspot, zoho)', 'crm')
            .replace('custom api', 'custom_api');
        const integrationTasks = planLogic.integrations[typeKey];
        if (integrationTasks) {
            integrationTasks.forEach(t => {
                addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
            });
        }
    });
    if (integrations.integration_engineering_effort === "Yes") {
        planLogic.integration_engineering_needed.yes.forEach(t => {
            addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
        });
    }

    // 8. Internal dependencies (Section 5 was removed - skip this logic)
    // Note: Internal dependencies section was removed from the form

    // 9. Go-live expectation adjustments
    const goLiveKey = (timeline.go_live_expectation || "6-8 weeks").toLowerCase().replace(/\s+/g, '_');
    const goLiveConfig = planLogic.go_live_expectation[goLiveKey] || planLogic.go_live_expectation["6_8_weeks"];
    goLiveConfig.extra_tasks.forEach(t => {
        addTaskToPhase(t.phase, t.task, t.duration_hours, t.assignee);
    });

    // Remove empty phases (phases with no activities)
    const filteredPhases = phases.filter(p => p.activities.length > 0);

    // Calculate recommended go-live date
    const baseWeeks = 8;
    const durationMultiplier = complexityConfig.duration_multiplier * goLiveConfig.duration_multiplier;
    const estimatedWeeks = Math.round(baseWeeks * durationMultiplier);
    const goLiveDate = new Date();
    goLiveDate.setDate(goLiveDate.getDate() + (estimatedWeeks * 7));

    // Engineering effort note (Section 5 was removed - use default)
    const engEffortNote = "No engineering dependency";

    // Re-number phases after filtering
    filteredPhases.forEach((phase, index) => {
        phase.phase = index + 1;
    });

    return {
        recommended_go_live: goLiveDate.toISOString().split('T')[0],
        timeline_adjusted: false,
        adjustment_reason: null,
        phases: filteredPhases,
        internal_notes: engEffortNote,
        estimated_timeline: `${estimatedWeeks} weeks`
    };
}

/**
 * Calculate Prospect readiness assessment using Gemini AI
 */
async function calculateProspectReadinessWithGemini(intake_responses) {
    if (!geminiModel) {
        throw new Error('Gemini model not available');
    }

    const prompt = `You are an expert implementation consultant for SpotDraft. Analyze this Prospect readiness assessment.

## PROSPECT ASSESSMENT DATA:
${JSON.stringify(intake_responses, null, 2)}

## YOUR TASK:
Calculate readiness scores for 7 sections (each out of 100 points), then calculate an overall weighted score:

**Section 1: Basics (Weight: 12%)**
Use ONLY these questions from prospect_section_1_basics:
- company_name: Provided = +33 points, Missing = +0
- industry: Selected = +33 points, Missing = +0
- user_count: Selected = +34 points, Missing = +0
- Max: 100 points

**Section 2: Scope Clarity (Weight: 15%)**
Use ONLY these questions from prospect_section_2_scope_clarity:
- modules_interested: At least 1 selected = +40 points (bonus +5 per additional module, max +40)
- assisted_workflows: Yes = +20, No = +10, Missing = +0
- contract_templates: "Yes, all available" = +20, "Yes, some available" = +15, "No, need help" = +5, Missing = +0
- assisted_migration: Yes = +10, No = +5, Missing = +0
- legacy_contracts: "Yes, all available" = +10, "Yes, some available" = +5, "No, need help" = +0, Missing = +0
- Max: 100 points

**Section 3: Templates (Weight: 15%)**
Use ONLY these questions from prospect_section_3_templates:
- assisted_templates: "Yes" = +30 points, "No" = +20, Missing = +0
- complexity: "Low" = +30, "Mid" = +20, "High" = +10, Missing = +0
- integrations_required: "No" = +20, "Yes" = +15, Missing = +0
- conditional_outputs_required: "No" = +10, "Yes" = +5, Missing = +0
- computations_required: "No" = +10, "Yes" = +5, Missing = +0
- Max: 100 points

**Section 4: Assisted Migration (Weight: 15%)**
Use ONLY these questions from prospect_section_4_assisted_migration:
- assisted_migration: "Yes" = +30 points, "No" = +20, Missing = +0
- volume_of_contracts: Selected = +25 points, Missing = +0
- current_location: Selected = +25 points, Missing = +0
- data_cleanliness: "Clean" = +20, "Mixed" = +15, "Messy" = +10, Missing = +0
- data_format: At least 1 selected = +20 points, Missing = +0
- Max: 100 points

**Section 5: Systems and Integrations (Weight: 15%)**
Use ONLY these questions from prospect_section_5_systems_integrations:
- systems_used: At least 1 selected = +50 points (bonus +5 per additional system, max +50)
- api_access: Yes = +50, "Not sure" = +25, No = +0, Missing = +0
- Max: 100 points

**Section 6: Timeline Readiness (Weight: 13%)**
Use ONLY these questions from prospect_section_6_timeline_readiness:
- go_live_timeline: Selected = +70 points, Missing = +0
- biggest_concern: Provided (optional) = +30 points bonus, Missing = +0
- Max: 100 points (70 if concern not provided, 100 if provided)

**Section 7: Additional Context (Weight: 15%)**
Use ONLY these questions from prospect_section_7_additional_context (all optional):
- internal_bottlenecks: Provided = +33 points, Missing = +0
- compliance_deadlines: Provided = +33 points, Missing = +0
- past_clm_experience: Provided = +34 points, Missing = +0
- Max: 100 points

**Overall Score Calculation:**
Overall = (Section1 × 0.12) + (Section2 × 0.15) + (Section3 × 0.15) + (Section4 × 0.15) + (Section5 × 0.15) + (Section6 × 0.13) + (Section7 × 0.15)
Round to nearest integer.

**Status Label & Description:**
- 80-100: "Ready to Purchase" - "You're well-prepared to start with SpotDraft. Minor preparation may be needed."
- 60-79: "Ready with Preparation" - "You're ready to purchase, but some preparation is recommended."
- 40-59: "Needs Preparation" - "Some preparation is needed before purchasing SpotDraft."
- 0-39: "Significant Preparation Required" - "Significant preparation is required before purchasing."

**Red Flags/Key Blockers:**
Identify critical issues that could block or delay implementation. Focus on:
- Template readiness gaps
- Integration complexity
- Timeline concerns
- Migration challenges

**Action Items:**
Create clear, prioritized action items focused on IMPROVING READINESS SCORES. Analyze the readiness score breakdown and identify the LOWEST-SCORING sections - these should be prioritized first as they offer the biggest opportunity for score improvement.

CRITICAL REQUIREMENTS FOR ACTION ITEMS:
1. **Score Impact Analysis**: For each action item, calculate and state the EXACT score improvement:
   - Current section score (e.g., "Your scope_clarity score is currently 60/100")
   - Target score after completion (e.g., "Completing this will increase it to 85/100")
   - Overall score improvement (e.g., "This will improve your overall readiness score by approximately 6 points (from 72 to 78)")
   - Use the section weights: basics (12%), scope_clarity (15%), templates (15%), assisted_migration (15%), systems_integrations (15%), timeline_readiness (13%), additional_context (15%)

2. **Prioritization**: Order items by:
   - Highest potential overall score improvement first
   - Lowest-scoring sections first (biggest opportunity)
   - Quick wins that can be completed in 1-2 weeks before slower items

3. **Specificity**: Each action item must be:
   - SPECIFIC: "Upload all 10 contract templates to the SpotDraft portal" not "Prepare templates"
   - ACTIONABLE: Include clear steps (e.g., "1. Gather all templates, 2. Review for completeness, 3. Upload via portal")
   - MEASURABLE: State what "done" looks like (e.g., "All templates uploaded and confirmed")

4. **Format**: Each action item must include:
   - task: Clear, specific action with steps
   - section: Which section it addresses
   - priority: "high", "medium", or "low" based on score impact
   - deadline: Realistic date (1-4 weeks from today, format: YYYY-MM-DD)
   - owner: Who should complete it (e.g., "Legal Team", "IT Manager", "Project Lead")
   - score_impact: String explaining current score, target score, and overall improvement (e.g., "Will improve scope_clarity from 60 to 85 (+25 points), increasing overall score by ~6 points")

Generate 8-12 high-priority action items that directly address readiness gaps. These should be items the prospect can complete BEFORE purchasing to improve their readiness score. Order them by potential impact on overall score improvement (highest impact first). Focus on items that can improve scores by 5+ points overall.

**Implementation Plan:**
Generate a WEEK-WISE DETAILED implementation plan with specific activities for each week. Break down the timeline into weekly phases with detailed activities.

REQUIREMENTS:
- Break down the timeline into WEEK-BY-WEEK phases (e.g., "Week 1", "Week 2-3", "Week 4-5")
- Each phase should specify the exact week(s) it covers
- Include detailed, specific activities for each week
- Show dependencies between phases
- Include milestones and deliverables for each week
- Specify who is responsible for activities (Customer team, SpotDraft team, or both)
- Provide estimated effort band (Small, Medium, Large)

Return ONLY valid JSON in this structure:
{
    "readiness_score": {
        "overall": <integer 0-100>,
        "breakdown": {
            "basics": <integer 0-100>,
            "scope_clarity": <integer 0-100>,
            "templates": <integer 0-100>,
            "assisted_migration": <integer 0-100>,
            "systems_integrations": <integer 0-100>,
            "timeline_readiness": <integer 0-100>,
            "additional_context": <integer 0-100>
        }
    },
    "status_label": "<string>",
    "status_description": "<string>",
    "red_flags": [
        {
            "section": "<string>",
            "issue": "<string>",
            "impact": "<string>",
            "severity": "<high|medium|low>"
        }
    ],
    "action_items": {
        "customer": [
            {
                "task": "<string>",
                "section": "<string>",
                "priority": "<high|medium|low>",
                "deadline": "<YYYY-MM-DD>",
                "owner": "<string>",
                "score_impact": "<string explaining current score, target score, and overall improvement>"
            }
        ],
        "spotdraft": []
    },
    "implementation_plan": {
        "recommended_go_live": "<YYYY-MM-DD>",
        "high_level_timeline": "<string>",
        "estimated_effort_band": "<Small|Medium|Large>",
        "phases": [
            {
                "phase": <integer>,
                "name": "<string>",
                "duration": "<string - must specify weeks, e.g., 'Week 1', 'Week 2-3', 'Week 4-5'>",
                "activities": ["<string - specific activities for this week>"],
                "milestones": ["<string - key deliverables for this week>"],
                "dependencies": "<string - what must be completed before this phase>",
                "responsible": "<string - Customer, SpotDraft, or Both>"
            }
        ]
    },
    "preparation_list": ["<string>"],
    "ai_insights": {
        "key_strengths": ["<string>"],
        "critical_concerns": ["<string>"],
        "recommendations": ["<string>"],
        "risk_assessment": "<string>",
        "timeline_confidence": "<high|medium|low>"
    }
}`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').trim();
        }
        
        const assessmentData = JSON.parse(jsonText);
        
        return {
            readiness_score: assessmentData.readiness_score,
            status_label: assessmentData.status_label,
            status_description: assessmentData.status_description,
            red_flags: assessmentData.red_flags || [],
            action_items: assessmentData.action_items || { customer: [], spotdraft: [] },
            implementation_plan: assessmentData.implementation_plan,
            preparation_list: assessmentData.preparation_list || [],
            ai_insights: assessmentData.ai_insights,
            gemini_request: prompt,
            gemini_response: text
        };
    } catch (error) {
        console.error('Error calculating Prospect assessment with Gemini:', error);
        throw new Error(`Prospect assessment failed: ${error.message}`);
    }
}

/**
 * Calculate Customer readiness assessment using Gemini AI
 */
async function calculateCustomerReadinessWithGemini(intake_responses) {
    if (!geminiModel) {
        throw new Error('Gemini model not available');
    }

    const prompt = `You are an expert implementation consultant for SpotDraft. Analyze this Customer readiness assessment.

## CUSTOMER ASSESSMENT DATA:
${JSON.stringify(intake_responses, null, 2)}

## YOUR TASK:
Calculate readiness scores for 8 sections (each out of 100 points), then calculate an overall weighted score:

**Section 1: Stakeholders (Weight: 13%)**
Use ONLY these questions from customer_section_1_stakeholders:
- primary_contact_name + primary_contact_role: Both provided = +40 points, Missing either = +0
- technical_contact_name + technical_contact_role: Both provided = +40 points, Missing either = +0
- team_distribution: At least 1 selected = +10 points, Missing = +0
- decision_approver: Selected = +10 points, Missing = +0
- Max: 100 points

**Section 2: Purchased Scope (Weight: 15%)**
Use ONLY these questions from customer_section_2_purchased_scope:
- purchased_modules: At least 1 selected = +40 points (bonus +5 per additional module, max +40)
- template_count: Selected = +30 points, Missing = +0
- template_readiness: "Ready" = +30, "Partially ready" = +20, "Not ready" = +0, Missing = +0
- Max: 100 points

**Section 3: Templates (Weight: 15%)**
Use ONLY these questions from customer_section_3_templates:
- assisted_templates: "Yes" = +25 points, "No" = +15, Missing = +0
- If assisted_templates is "Yes":
  - complexity: "Low" = +20, "Mid" = +15, "High" = +10, Missing = +0
  - integrations_required: "No" = +15, "Yes" = +10, Missing = +0
  - conditional_outputs_required: "No" = +10, "Yes" = +5, Missing = +0
  - computations_required: "No" = +10, "Yes" = +5, Missing = +0
  - number_of_templates: Provided (numeric value >= 1) = +10 points, Missing or invalid = +0
- If assisted_templates is "No": Skip the conditional questions (they are hidden)
- Max: 100 points (15 if assisted_templates = "No", 100 if "Yes" and all conditional questions answered)

**Section 4: Migration (Weight: 13%)**
Use ONLY these questions from customer_section_4_migration:
- migration_needed: Selected = +30 points, Missing = +0
- If migration_needed is NOT "No": 
  - migration_contract_count: Selected = +25 points, Missing = +0
  - contract_storage: Selected = +25 points, Missing = +0
  - data_cleanliness: Selected = +20 points, Missing = +0
- If migration_needed is "No": Skip the 3 conditional questions (they are hidden)
- Max: 100 points (30 if migration = "No", 100 if migration needed and all 3 answered)

**Section 5: Integrations (Weight: 13%)**
Use ONLY these questions from customer_section_5_integrations:
- integration_systems: At least 1 selected = +40 points (bonus +5 per additional system, max +40)
- api_access: "Yes" = +30, "Not sure" = +15, "No" = +0, Missing = +0
- webhooks_support: "Yes" = +30, "Not sure" = +15, "No" = +0, Missing = +0
- Max: 100 points

**Section 6: Business Processes (Weight: 13%)**
Use ONLY these questions from customer_section_6_business_processes:
- approval_complexity: Selected = +50 points, Missing = +0
- agreement_signers: Selected = +50 points, Missing = +0
- Max: 100 points

**Section 7: Security and Access (Weight: 10%)**
Use ONLY these questions from customer_section_7_security_access:
- sso_required: Selected = +35 points, Missing = +0
- security_needs: "Yes" = +35, "No" = +30, Missing = +0
- dpa_status: "Signed" = +30, "In progress" = +20, "Not started" = +0, Missing = +0
- Max: 100 points

**Section 8: Optional Uploads (Weight: 8%)**
Use ONLY these questions from customer_section_8_uploads:
- templates: Array has files = +50 points, Empty array = +0
- sample_contracts: Array has files = +50 points, Empty array = +0
- Max: 100 points (0 if nothing uploaded, 50 if one uploaded, 100 if both uploaded)

**Overall Score Calculation:**
Overall = (Section1 × 0.13) + (Section2 × 0.15) + (Section3 × 0.15) + (Section4 × 0.13) + (Section5 × 0.13) + (Section6 × 0.13) + (Section7 × 0.10) + (Section8 × 0.08)
Round to nearest integer.

**Status Label & Description:**
- 80-100: "Ready to Proceed" - "Your organization is well-prepared for implementation."
- 60-79: "Ready with Minor Blockers" - "A few items need attention before go-live."
- 40-59: "Needs Preparation" - "Some preparation is needed before implementation can begin."
- 0-39: "Significant Preparation Required" - "Significant preparation is required before implementation."

**Red Flags/Blockers:**
Identify blockers by category: template, migration, integration, security.

**Action Items:**
Create clear, prioritized action items focused on IMPROVING READINESS SCORES. Analyze the readiness score breakdown and identify the LOWEST-SCORING sections - these should be prioritized first as they offer the biggest opportunity for score improvement.

CRITICAL REQUIREMENTS FOR ACTION ITEMS:
1. **Score Impact Analysis**: For each action item, calculate and state the EXACT score improvement:
   - Current section score (e.g., "Your uploads score is currently 0/100")
   - Target score after completion (e.g., "Completing this will increase it to 100/100")
   - Overall score improvement (e.g., "This will improve your overall readiness score by approximately 10 points (from 75 to 85)")
   - Use the section weights: stakeholders (13%), purchased_scope (15%), templates (15%), migration (13%), integrations (13%), business_processes (13%), security_access (10%), uploads (8%)

2. **Prioritization**: Order items by:
   - Highest potential overall score improvement first
   - Lowest-scoring sections first (biggest opportunity)
   - Quick wins that can be completed in 1-2 weeks before slower items

3. **Specificity**: Each action item must be:
   - SPECIFIC: "Upload all 10 contract templates and 5 sample contracts to the SpotDraft portal" not "Upload templates"
   - ACTIONABLE: Include clear steps (e.g., "1. Gather all templates from legal team, 2. Review for completeness, 3. Upload via portal, 4. Confirm receipt")
   - MEASURABLE: State what "done" looks like (e.g., "All templates uploaded and confirmed by SpotDraft team")

4. **Format**: Each action item must include:
   - task: Clear, specific action with steps
   - section: Which section it addresses
   - priority: "high", "medium", or "low" based on score impact
   - deadline: Realistic date (1-4 weeks from today, format: YYYY-MM-DD)
   - owner: Who should complete it (e.g., "Legal Operations Manager", "IT Team", "SpotDraft Implementation Team")
   - score_impact: String explaining current score, target score, and overall improvement (e.g., "Will improve uploads from 0 to 100 (+100 points), increasing overall score by ~10 points")

Generate 8-12 high-priority action items for customer team and 4-6 for SpotDraft team. Prioritize items that address the lowest-scoring sections first, as these will have the biggest impact on improving readiness. Order them by potential impact on overall score improvement (highest impact first). Focus on items that can improve scores by 5+ points overall.

**Implementation Plan:**
Generate a WEEK-WISE DETAILED implementation plan with specific activities for each week. Break down the timeline into weekly phases with detailed activities.

REQUIREMENTS:
- Break down the timeline into WEEK-BY-WEEK phases (e.g., "Week 1", "Week 2-3", "Week 4-5")
- Each phase should specify the exact week(s) it covers
- Include detailed, specific activities for each week
- Show dependencies between phases
- Include milestones and deliverables for each week
- Specify who is responsible for activities (Customer team, SpotDraft team, or both)
- Activities should be specific and actionable (e.g., "Week 1: Upload all contract templates to SpotDraft portal" not "Week 1: Template preparation")

Return ONLY valid JSON in this structure:
{
    "readiness_score": {
        "overall": <integer 0-100>,
        "breakdown": {
            "stakeholders": <integer 0-100>,
            "purchased_scope": <integer 0-100>,
            "templates": <integer 0-100>,
            "migration": <integer 0-100>,
            "integrations": <integer 0-100>,
            "business_processes": <integer 0-100>,
            "security_access": <integer 0-100>,
            "uploads": <integer 0-100>
        }
    },
    "status_label": "<string>",
    "status_description": "<string>",
    "red_flags": [
        {
            "section": "<string>",
            "issue": "<string>",
            "impact": "<string>",
            "severity": "<high|medium|low>",
            "category": "<template|migration|integration|security>"
        }
    ],
    "action_items": {
        "customer": [...],
        "spotdraft": [...]
    },
    "implementation_plan": {
        "recommended_go_live": "<YYYY-MM-DD>",
        "high_level_timeline": "<string>",
        "phases": [
            {
                "phase": <integer>,
                "name": "<string>",
                "duration": "<string - must specify weeks, e.g., 'Week 1', 'Week 2-3', 'Week 4-5'>",
                "activities": ["<string - specific activities for this week>"],
                "milestones": ["<string - key deliverables for this week>"],
                "dependencies": "<string - what must be completed before this phase>",
                "responsible": "<string - Customer, SpotDraft, or Both>",
                "status": "<Ready|Partially ready|Blocked|Scheduled>"
            }
        ]
    },
    "ai_insights": {
        "key_strengths": ["<string>"],
        "critical_concerns": ["<string>"],
        "recommendations": ["<string>"],
        "risk_assessment": "<string>",
        "timeline_confidence": "<high|medium|low>"
    }
}`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').trim();
        }
        
        const assessmentData = JSON.parse(jsonText);
        
        return {
            readiness_score: assessmentData.readiness_score,
            status_label: assessmentData.status_label,
            status_description: assessmentData.status_description,
            red_flags: assessmentData.red_flags || [],
            action_items: assessmentData.action_items || { customer: [], spotdraft: [] },
            implementation_plan: assessmentData.implementation_plan,
            ai_insights: assessmentData.ai_insights,
            gemini_request: prompt,
            gemini_response: text
        };
    } catch (error) {
        console.error('Error calculating Customer assessment with Gemini:', error);
        throw new Error(`Customer assessment failed: ${error.message}`);
    }
}

/**
 * Calculate IM readiness assessment using Gemini AI
 */
async function calculateIMReadinessWithGemini(intake_responses, implementationPlan) {
    if (!geminiModel) {
        throw new Error('Gemini model not available');
    }

    const prompt = `You are an expert implementation consultant for SpotDraft. Analyze this Implementation Manager assessment and generate readiness insights.

## IM ASSESSMENT DATA:
${JSON.stringify(intake_responses, null, 2)}

## IMPLEMENTATION PLAN (Already Generated):
${JSON.stringify(implementationPlan, null, 2)}

## YOUR TASK:
Calculate readiness scores for 5 sections (each out of 100 points), then calculate an overall weighted score:

**Section 1: Customer Context (Weight: 20%)**
Use ONLY these questions from im_section_1_customer_context:
- customer_name: Provided = +30 points, Missing = +0
- package: Selected = +30 points, Missing = +0
- complexity: Selected = +30 points, Missing = +0
- known_risks: At least 1 selected = +10 points bonus (proactive identification), Empty array = +0
- Max: 100 points (90 if no risks identified, 100 if risks identified)

**Section 2: Scope & Deliverables (Weight: 20%)**
Use ONLY these questions from im_section_2_scope_deliverables:
- template_count: Selected = +30 points, Missing = +0
- workflow_complexity: Selected = +30 points, Missing = +0
- custom_development: Selected = +20 points, Missing = +0
- custom_development_details: If custom_development is "Yes" and details provided = +20 points, Otherwise = +0
- Max: 100 points (80 if custom_development = "No", 100 if "Yes" with details)

**Section 3: Migration Details (Weight: 20%)**
Use ONLY these questions from im_section_3_migration_details:
- csv_migration_required: Selected = +33 points, Missing = +0
- assisted_migration: Selected = +33 points, Missing = +0
- metadata_type: Selected = +34 points, Missing = +0
- migration_volume: Selected = +0 points (already counted in other fields), Missing = +0
- Max: 100 points

**Section 4: Integrations (Weight: 20%)**
Use ONLY these questions from im_section_4_integrations:
- integration_types: At least 1 selected = +40 points (bonus +5 per additional type, max +40)
- integration_engineering_effort: Selected = +30 points, Missing = +0
- integration_uat_rounds: Selected = +30 points, Missing = +0
- pre_known_blockers: Provided (optional) = +0 points (informational only, not scored)
- Max: 100 points

**Section 5: Timeline Expectations (Weight: 20%)**
Use ONLY these questions from im_section_5_timeline_expectations:
- go_live_expectation: Selected = +70 points, Missing = +0
- known_blockers: Provided (optional) = +30 points bonus, Missing or empty = +0
- Max: 100 points (70 if blockers not provided, 100 if provided)

**Overall Score Calculation:**
Overall = (Section1 × 0.20) + (Section2 × 0.20) + (Section3 × 0.20) + (Section4 × 0.20) + (Section5 × 0.20)
Round to nearest integer.

**Status Label & Description:**
- 80-100: "Plan Ready" - "All information captured. Ready to generate Rocketlane plan."
- 60-79: "Plan Ready with Notes" - "Plan ready, but some areas need attention."
- 40-59: "Incomplete Information" - "Some critical information missing for plan generation."
- 0-39: "Significant Gaps" - "Significant information gaps. Please complete assessment."

**Red Flags/Internal Notes:**
Based on known risks and blockers identified. Include internal notes for SpotDraft team.

**Action Items:**
Create clear, prioritized action items focused on IMPROVING READINESS SCORES and addressing blockers. Analyze the readiness score breakdown and identify the LOWEST-SCORING sections - these should be prioritized first as they offer the biggest opportunity for score improvement.

CRITICAL REQUIREMENTS FOR ACTION ITEMS:
1. **Score Impact Analysis**: For each action item, calculate and state the EXACT score improvement:
   - Current section score (e.g., "Your integrations score is currently 50/100")
   - Target score after completion (e.g., "Completing this will increase it to 90/100")
   - Overall score improvement (e.g., "This will improve your overall readiness score by approximately 8 points (from 70 to 78)")
   - Use the section weights: customer_context (20%), scope_deliverables (20%), migration_details (20%), integrations (20%), timeline_expectations (20%)

2. **Prioritization**: Order items by:
   - Highest potential overall score improvement first
   - Lowest-scoring sections first (biggest opportunity)
   - Blockers that prevent plan generation before other items
   - Quick wins that can be completed in 1-2 weeks before slower items

3. **Specificity**: Each action item must be:
   - SPECIFIC: "Complete security review questionnaire, gather required documentation, and submit to InfoSec team by [date]" not "Handle security review"
   - ACTIONABLE: Include clear steps (e.g., "1. Download questionnaire, 2. Gather required docs, 3. Schedule review meeting, 4. Submit completed form")
   - MEASURABLE: State what "done" looks like (e.g., "Security review approved and documented in system")

4. **Format**: Each action item must include:
   - task: Clear, specific action with steps
   - section: Which section it addresses
   - priority: "high", "medium", or "low" based on score impact and blocker status
   - deadline: Realistic date (1-4 weeks from today, format: YYYY-MM-DD)
   - owner: Who should complete it (e.g., "Customer IT Team", "SpotDraft Security Team", "Internal PM")
   - score_impact: String explaining current score, target score, and overall improvement (e.g., "Will improve integrations from 50 to 90 (+40 points), increasing overall score by ~8 points")

Generate 6-10 high-priority action items for customer team, 4-6 for SpotDraft team, and 3-5 for internal team. Prioritize items that address blockers and lowest-scoring sections first, as these will have the biggest impact on improving readiness and plan quality. Order them by potential impact on overall score improvement (highest impact first). Focus on items that can improve scores by 5+ points overall.

**AI Insights:**
Provide strategic insights for the implementation plan.

Return ONLY valid JSON in this structure:
{
    "readiness_score": {
        "overall": <integer 0-100>,
        "breakdown": {
            "customer_context": <integer>,
            "scope_deliverables": <integer>,
            "migration_details": <integer>,
            "integrations": <integer>,
            "internal_dependencies": <integer>,
            "timeline_expectations": <integer>
        }
    },
    "status_label": "<string>",
    "status_description": "<string>",
    "red_flags": [
        {
            "section": "<string>",
            "issue": "<string>",
            "impact": "<string>",
            "severity": "<high|medium|low>"
        }
    ],
    "action_items": {
        "customer": [
            {
                "task": "<string>",
                "section": "<string>",
                "priority": "<high|medium|low>",
                "deadline": "<YYYY-MM-DD>",
                "owner": "<string>",
                "score_impact": "<string explaining current score, target score, and overall improvement>"
            }
        ],
        "spotdraft": [
            {
                "task": "<string>",
                "section": "<string>",
                "priority": "<high|medium|low>",
                "deadline": "<YYYY-MM-DD>",
                "owner": "<string>",
                "score_impact": "<string explaining current score, target score, and overall improvement>"
            }
        ],
        "internal": [
            {
                "task": "<string>",
                "section": "<string>",
                "priority": "<high|medium|low>",
                "deadline": "<YYYY-MM-DD>",
                "owner": "<string>",
                "score_impact": "<string explaining current score, target score, and overall improvement>"
            }
        ]
    },
    "ai_insights": {
        "key_strengths": [...],
        "critical_concerns": [...],
        "recommendations": [...],
        "risk_assessment": "<string>",
        "timeline_confidence": "<high|medium|low>"
    }
}`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').trim();
        }
        
        const assessmentData = JSON.parse(jsonText);
        
        return {
            readiness_score: assessmentData.readiness_score,
            status_label: assessmentData.status_label,
            status_description: assessmentData.status_description,
            red_flags: assessmentData.red_flags || [],
            action_items: assessmentData.action_items || { customer: [], spotdraft: [], internal: [] },
            ai_insights: assessmentData.ai_insights,
            gemini_request: prompt,
            gemini_response: text
        };
    } catch (error) {
        console.error('Error calculating IM assessment with Gemini:', error);
        throw new Error(`IM assessment failed: ${error.message}`);
    }
}

function createImplementationPlan(responses, readinessScore) {
    const overallScore = readinessScore.overall;
    
    // Estimate timeline based on score and complexity
    let baseWeeks = 8;
    
    if (overallScore < 40) baseWeeks = 20;
    else if (overallScore < 60) baseWeeks = 16;
    else if (overallScore < 80) baseWeeks = 12;
    
    // Adjust based on modules
    const s2 = responses.section_2_order_form_scope;
    if (s2.purchased_modules?.includes('Migration') && s2.migration_contract_count > 1000) {
        baseWeeks += 4;
    }
    if (s2.purchased_modules?.includes('Integrations') && responses.section_5_integration_readiness?.systems_to_integrate?.length > 2) {
        baseWeeks += 2;
    }

    const phases = [
        {
            phase: 'Phase 1: Setup & Configuration',
            duration: '4-6 weeks',
            tasks: [
                'Account setup and user provisioning',
                'Template configuration and review',
                'Initial user training',
                'Basic workflow setup'
            ]
        }
    ];

    if (s2.purchased_modules?.includes('Migration')) {
        phases.push({
            phase: 'Phase 2: Migration',
            duration: '6-10 weeks',
            tasks: [
                'Data extraction and cleaning',
                'Metadata mapping',
                'Contract migration',
                'Quality assurance and validation'
            ]
        });
    }

    if (s2.purchased_modules?.includes('Integrations')) {
        phases.push({
            phase: 'Phase 3: Integration Setup',
            duration: '4-8 weeks',
            tasks: [
                'Integration architecture design',
                'API/webhook configuration',
                'Data sync setup',
                'Integration testing'
            ]
        });
    }

    phases.push({
        phase: 'Phase 4: Go-Live & Support',
        duration: '2-4 weeks',
        tasks: [
            'Final testing',
            'User acceptance testing',
            'Go-live support',
            'Post-launch optimization'
        ]
    });

    return {
        estimated_timeline: `${baseWeeks}-${baseWeeks + 4} weeks`,
        phases: phases
    };
}

/**
 * Calculate complete readiness assessment using Gemini AI
 * This replaces all manual calculations with AI-powered analysis
 */
async function calculateReadinessWithGemini(intake_responses) {
    if (!geminiModel) {
        throw new Error('Gemini model not available');
    }

    const prompt = `You are an expert implementation consultant for SpotDraft, a contract lifecycle management (CLM) platform. Your task is to analyze a comprehensive implementation readiness assessment and calculate readiness scores, identify risks, and create an implementation plan.

## REQUEST PAYLOAD (Input Data):
${JSON.stringify(intake_responses, null, 2)}

## CALCULATION INSTRUCTIONS:

### 1. READINESS SCORE CALCULATION
Calculate readiness scores for 7 sections (each out of 100 points), then calculate an overall weighted score:

**Section 1: Account & Stakeholder (Weight: 15%)**
- Organization name provided: +20 points
- Primary POC complete (name, role, email, timezone): +20 points
- Legal POC complete (name, role, email, timezone): +15 points
- Technical POC complete (if integrations required): +10 points
- Availability specified: +10 points
- Communication channels selected: +10 points
- Expected go-live date provided: +15 points
- Max: 100 points

**Section 2: Order Form Scope (Weight: 15%)**
- Purchased modules identified: +30 points (10 per module: Template Setup, Migration, Integrations)
- Template count specified (if Template Setup module): +15 points
- Migration contract count specified (if Migration module): +15 points
- Migration file formats specified: +10 points
- Additional add-ons mentioned: +10 points
- Max: 100 points

**Section 3: Template Readiness (Weight: 20%)**
- Templates finalized (Yes: +30, In review: +20, No: +0)
- Template formats specified: +15 points
- Conditional logic complexity (None: +15, Simple: +10, Moderate: +5, Complex: +0)
- Dynamic rendering (No: +15, Yes-Simple: +10, Yes-Moderate: +5, Yes-Complex: +0)
- No clause-level changes needed: +10 points
- Approval matrices exist: +10 points
- Template count specified: +10 points
- Max: 100 points

**Section 4: Migration Readiness (Weight: 15%)**
- Contract count specified: +20 points
- Contract types listed: +15 points
- Structured naming (Yes-100%: +25, Partial: +15, None: +0)
- Storage location specified: +15 points
- Contract formats specified: +10 points
- Existing metadata (Yes-fully: +15, Yes-partially: +10, No: +0)
- Migration priority specified: +5 points
- Max: 100 points

**Section 5: Integration Readiness (Weight: 15%)**
- Systems to integrate specified: +25 points (5 per system)
- Admin access (Yes-all: +25, Yes-some: +15, No: +0)
- Security approval status (No: +20, Not sure: +10, Yes: +5)
- API/Webhook access available: +15 points
- Decision maker identified: +10 points
- Integration outcomes specified: +5 points
- Max: 100 points

**Section 6: Business Process (Weight: 10%)**
- Approval workflow (Yes-documented: +30, Yes-informal: +20, No: +0)
- Contracts per month specified: +15 points
- Contract generators identified: +15 points
- Bottlenecks described: +15 points
- Phase 1 must-haves specified: +15 points
- Workflow details provided (if workflow exists): +10 points
- Max: 100 points

**Section 7: Security & Compliance (Weight: 10%)**
- Security review (Completed: +30, No: +20, Yes: +10)
- Infosec approvals (No: +20, Not sure: +10, Yes: +5)
- Data residency (No: +20, Not sure: +10, Yes: +5)
- Custom SSO (No: +15, Yes: +10)
- Security reviews specified (if review needed): +10 points
- Max: 100 points

**Overall Score Calculation:**
Multiply each section score by its weight, then sum:
Overall = (Section1 × 0.15) + (Section2 × 0.15) + (Section3 × 0.20) + (Section4 × 0.15) + (Section5 × 0.15) + (Section6 × 0.10) + (Section7 × 0.10)
Round to nearest integer.

### 2. STATUS LABEL & DESCRIPTION
Based on overall score:
- 80-100: "Ready to Proceed" - "Your organization is well-prepared for implementation. Minor items may need attention, but you're ready to move forward."
- 60-79: "Ready with Minor Blockers" - "Your organization is well-prepared for implementation. A few items need attention before go-live."
- 40-59: "Needs Preparation" - "Some preparation is needed before implementation can begin. Address the identified blockers first."
- 0-39: "Significant Preparation Required" - "Significant preparation is required before implementation. Please address the critical blockers identified."

### 3. RED FLAGS IDENTIFICATION
Identify critical issues that could block or delay implementation. For each red flag, provide:
- section: Which section it relates to
- issue: Brief description of the problem
- impact: How this affects the timeline/implementation
- severity: "high", "medium", or "low"

Examples:
- Security review pending but not specified
- Templates not finalized
- No admin access for required integrations
- Large migration volume with no structured naming
- Missing critical POC information

### 4. ACTION ITEMS
Create actionable tasks for both customer and SpotDraft teams. For each item:
- task: Specific action to take
- section: Related section
- priority: "high", "medium", or "low"
- deadline: Suggested date (YYYY-MM-DD format, 1-4 weeks from today)
- owner: Who should handle it

### 5. IMPLEMENTATION PLAN
Create a WEEK-WISE DETAILED phased implementation plan with:
- recommended_go_live: Target date (YYYY-MM-DD, typically 8-12 weeks from today)
- timeline_adjusted: true/false based on blockers
- adjustment_reason: Why timeline was adjusted (if applicable)
- phases: Array of implementation phases, each with:
  - phase: Phase number (1, 2, 3, etc.)
  - name: Phase name
  - duration: MUST specify exact weeks (e.g., "Week 1", "Week 2-3", "Week 4-5", "Week 6-8")
  - activities: Array of SPECIFIC activities for each week (e.g., "Week 1: Upload all contract templates to SpotDraft portal")
  - milestones: Key deliverables for this phase/week
  - dependencies: What must be completed before this phase
  - responsible: Who handles activities (Customer, SpotDraft, or Both)
  - status: "Ready", "Partially ready", "Blocked", or "Scheduled"
  
CRITICAL: Break down activities WEEK-BY-WEEK. Each phase should clearly indicate which week(s) it covers, and activities should be specific to those weeks.

### 6. AI INSIGHTS
Provide strategic insights:
- key_strengths: 2-3 main strengths
- critical_concerns: 2-3 main concerns
- recommendations: 2-3 priority recommendations
- risk_assessment: Brief risk assessment (1-2 sentences)
- timeline_confidence: "high", "medium", or "low"

## RESPONSE PAYLOAD (Required JSON Format):
Return ONLY valid JSON in this exact structure (no markdown, no explanations):

{
    "readiness_score": {
        "overall": <integer 0-100>,
        "breakdown": {
            "account_stakeholder": <integer 0-100>,
            "order_form_scope": <integer 0-100>,
            "template_readiness": <integer 0-100>,
            "migration_readiness": <integer 0-100>,
            "integration_readiness": <integer 0-100>,
            "business_process": <integer 0-100>,
            "security_compliance": <integer 0-100>
        }
    },
    "status_label": "<string>",
    "status_description": "<string>",
    "red_flags": [
        {
            "section": "<string>",
            "issue": "<string>",
            "impact": "<string>",
            "severity": "<high|medium|low>"
        }
    ],
    "action_items": {
        "customer": [
            {
                "task": "<string>",
                "section": "<string>",
                "priority": "<high|medium|low>",
                "deadline": "<YYYY-MM-DD>",
                "owner": "<string>",
                "score_impact": "<string explaining current score, target score, and overall improvement>"
            }
        ],
        "spotdraft": [
            {
                "task": "<string>",
                "section": "<string>",
                "priority": "<high|medium|low>",
                "deadline": "<YYYY-MM-DD>",
                "owner": "<string>",
                "score_impact": "<string explaining current score, target score, and overall improvement>"
            }
        ]
    },
    "implementation_plan": {
        "recommended_go_live": "<YYYY-MM-DD>",
        "timeline_adjusted": <boolean>,
        "adjustment_reason": "<string or null>",
        "phases": [
            {
                "phase": <integer>,
                "name": "<string>",
                "duration": "<string - must specify weeks, e.g., 'Week 1', 'Week 2-3', 'Week 4-5'>",
                "activities": ["<string - specific activities for this week>"],
                "milestones": ["<string - key deliverables for this week>"],
                "dependencies": "<string or null>",
                "responsible": "<string - Customer, SpotDraft, or Both>",
                "status": "<Ready|Partially ready|Blocked|Scheduled>"
            }
        ]
    },
    "ai_insights": {
        "key_strengths": ["<string>"],
        "critical_concerns": ["<string>"],
        "recommendations": ["<string>"],
        "risk_assessment": "<string>",
        "timeline_confidence": "<high|medium|low>"
    }
}

IMPORTANT: Return ONLY the JSON object, no additional text, no markdown code blocks, no explanations.`;

    try {
        console.log('Sending assessment request to Gemini...');
        console.log(`Full prompt length: ${prompt.length} characters`);
        console.log(`Full intake data: ${JSON.stringify(intake_responses, null, 2).length} characters`);
        
        // No timeout limits on Render - use full prompt for maximum accuracy
        // The model will process the complete data without truncation
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Extract JSON from response
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').trim();
        }
        
        const assessmentData = JSON.parse(jsonText);
        
        // Validate required fields
        if (!assessmentData.readiness_score || !assessmentData.readiness_score.overall) {
            throw new Error('Invalid response: missing readiness_score');
        }
        
        return {
            readiness_score: assessmentData.readiness_score,
            status_label: assessmentData.status_label,
            status_description: assessmentData.status_description,
            red_flags: assessmentData.red_flags || [],
            action_items: assessmentData.action_items || { customer: [], spotdraft: [] },
            implementation_plan: assessmentData.implementation_plan,
            ai_insights: assessmentData.ai_insights,
            gemini_request: prompt,
            gemini_response: text
        };
    } catch (error) {
        console.error('Error calculating assessment with Gemini:', error);
        throw new Error(`Gemini assessment failed: ${error.message}`);
    }
}

/**
 * Generate AI-powered insights for the assessment
 */
async function generateAIInsights(responses, readinessScore, redFlags) {
    if (!geminiModel) {
        return {
            insights: null,
            gemini_request: null,
            gemini_response: null
        };
    }

    const prompt = `You are an expert implementation consultant analyzing a SpotDraft implementation readiness assessment.

Assessment Summary:
- Overall Readiness Score: ${readinessScore.overall}/100
- Section Scores: ${JSON.stringify(readinessScore.breakdown)}
- Red Flags: ${redFlags.length} identified

Key Information:
${JSON.stringify(responses, null, 2)}

Provide concise, actionable insights in JSON format:
{
    "key_strengths": ["list 2-3 main strengths"],
    "critical_concerns": ["list 2-3 main concerns"],
    "recommendations": ["list 2-3 priority recommendations"],
    "risk_assessment": "brief risk assessment (1-2 sentences)",
    "timeline_confidence": "high/medium/low based on readiness"
}

Be specific and actionable. Focus on what will help ensure successful implementation.`;

    try {
        const result = await geminiModel.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        // Extract JSON from response
        let jsonText = text.trim();
        if (jsonText.startsWith('```json')) {
            jsonText = jsonText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        } else if (jsonText.startsWith('```')) {
            jsonText = jsonText.replace(/```\n?/g, '').trim();
        }
        
        return {
            insights: JSON.parse(jsonText),
            gemini_request: prompt,
            gemini_response: text
        };
    } catch (error) {
        console.error('Error generating AI insights:', error);
        return {
            insights: null,
            gemini_request: prompt,
            gemini_response: `Error: ${error.message}`
        };
    }
}

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({ 
        status: 'ok', 
        timestamp: new Date().toISOString(),
        gemini_available: !!geminiModel
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`SpotSmart API server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Parse Order Form: POST http://localhost:${PORT}/parse-order-form`);
    console.log(`Assess Readiness: POST http://localhost:${PORT}/assess`);
});

module.exports = app;

