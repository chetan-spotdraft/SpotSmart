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

// Optimized generation config for production accuracy (shared across all model initializations)
const GEMINI_GENERATION_CONFIG = {
    temperature: 0.3,  // Lower temperature for consistent, accurate results
    topP: 0.95,        // Focus on high-probability tokens
    topK: 40           // Consider top 40 tokens for better accuracy
};

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
                    // Initialize with optimized config for maximum accuracy
                    geminiModel = genAI.getGenerativeModel({ 
                        model: modelName,
                        generationConfig: GEMINI_GENERATION_CONFIG
                    });
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

        // Use deterministic scoring + Gemini for insights
        let readinessScore = null;
        let redFlags = [];
        let actionItems = { customer: [], spotdraft: [] };
        let implementationPlan = null;
        let aiInsights = null;
        let geminiRequest = null;
        let geminiResponse = null;
        let statusLabel = 'Calculating...';
        let statusDescription = 'Analyzing your responses...';
        let rationales = null;

        if (!geminiModel) {
            return res.status(500).json({
                success: false,
                error: 'Gemini AI is required for assessment calculation. Please ensure GEMINI_API_KEY is configured.'
            });
        }

        try {
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
            const rationales = assessmentResult.rationales; // Include scoring rationales
            console.log('Gemini assessment completed successfully');
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
            rationales: rationales, // Include scoring rationales for explainability
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
        // Apply optimized generation config for consistent production accuracy
        geminiModel = genAI.getGenerativeModel({ 
            model: 'gemini-2.5-flash',
            generationConfig: GEMINI_GENERATION_CONFIG
        });
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
            // Apply optimized generation config for consistent production accuracy
            geminiModel = genAI.getGenerativeModel({ 
                model: 'gemini-2.5-flash',
                generationConfig: GEMINI_GENERATION_CONFIG
            });
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
                    // Apply optimized generation config for consistent production accuracy
                    geminiModel = genAI.getGenerativeModel({ 
                        model: 'gemini-2.5-flash',
                        generationConfig: GEMINI_GENERATION_CONFIG
                    });
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
 * Deterministic Readiness Score Calculation
 * Implements rule-based scoring with explainable rationales
 */
function calculateDeterministicReadinessScore(intake_responses) {
    const s1 = intake_responses.section_1_account_stakeholder || {};
    const s2 = intake_responses.section_2_order_form_scope || {};
    const s3 = intake_responses.section_3_template_readiness || {};
    const s4 = intake_responses.section_4_migration_readiness || {};
    const s5 = intake_responses.section_5_integration_readiness || {};
    const s6 = intake_responses.section_6_business_process || {};
    const s7 = intake_responses.section_7_security_compliance || {};
    
    const rationales = {};
    
    // Helper: Check if value is complete & clear
    function isComplete(value) {
        return value && value !== '' && value !== null && value !== undefined;
    }
    
    // Helper: Check if value is partial
    function isPartial(value) {
        return value && value !== '' && value !== null && value !== undefined && 
               (typeof value === 'string' && value.length < 10);
    }
    
    // Helper: Award points based on completeness
    function awardPoints(value, maxPoints, itemName) {
        if (isComplete(value)) {
            rationales[itemName] = `Complete & Clear → ${maxPoints} pts`;
            return maxPoints;
        } else if (isPartial(value)) {
            rationales[itemName] = `Partial / Draft → ${Math.floor(maxPoints * 0.5)} pts`;
            return Math.floor(maxPoints * 0.5);
        } else {
            rationales[itemName] = `Missing / High Risk → 0 pts`;
            return 0;
        }
    }
    
    // Helper: Check if object has all required fields
    function isPOCComplete(poc) {
        return poc && isComplete(poc.name) && isComplete(poc.email) && 
               (isComplete(poc.role) || isComplete(poc.timezone));
    }
    
    // ============================================
    // SECTION 1: Account & Stakeholders (100 pts)
    // ============================================
    let s1Score = 0;
    const s1Rationales = {};
    
    // Primary POC identified & responsive: 30 pts
    const primaryPOCComplete = isPOCComplete(s1.primary_poc);
    s1Score += primaryPOCComplete ? 30 : (s1.primary_poc ? 15 : 0);
    s1Rationales.primary_poc = primaryPOCComplete ? 
        'Primary POC complete (name, email, role/timezone) → 30 pts' : 
        (s1.primary_poc ? 'Primary POC partial → 15 pts' : 'Primary POC missing → 0 pts');
    
    // Legal POC identified: 20 pts
    const legalPOCComplete = isPOCComplete(s1.legal_poc);
    s1Score += legalPOCComplete ? 20 : (s1.legal_poc ? 10 : 0);
    s1Rationales.legal_poc = legalPOCComplete ? 
        'Legal POC complete → 20 pts' : 
        (s1.legal_poc ? 'Legal POC partial → 10 pts' : 'Legal POC missing → 0 pts');
    
    // Technical POC identified (if needed): 20 pts
    if (s1.integrations_required) {
        const techPOCComplete = isPOCComplete(s1.technical_poc);
        s1Score += techPOCComplete ? 20 : (s1.technical_poc ? 10 : 0);
        s1Rationales.technical_poc = techPOCComplete ? 
            'Technical POC complete → 20 pts' : 
            (s1.technical_poc ? 'Technical POC partial → 10 pts' : 'Technical POC missing → 0 pts');
    } else {
        s1Rationales.technical_poc = 'No integrations required → N/A';
    }
    
    // Decision-maker identified: 20 pts (using primary POC as proxy if no separate field)
    s1Score += awardPoints(s1.primary_poc?.name || s1.legal_poc?.name, 20, 'decision_maker');
    s1Rationales.decision_maker = rationales.decision_maker;
    delete rationales.decision_maker;
    
    // Communication cadence agreed: 10 pts
    const hasCommChannels = s1.communication_channels && s1.communication_channels.length > 0;
    const hasAvailability = isComplete(s1.availability);
    s1Score += (hasCommChannels && hasAvailability) ? 10 : (hasCommChannels || hasAvailability ? 5 : 0);
    s1Rationales.communication_cadence = (hasCommChannels && hasAvailability) ? 
        'Communication channels and availability specified → 10 pts' : 
        (hasCommChannels || hasAvailability ? 'Partial communication info → 5 pts' : 'Missing → 0 pts');
    
    rationales.section_1 = s1Rationales;
    
    // ============================================
    // SECTION 2: Order Form Scope (100 pts)
    // ============================================
    let s2Score = 0;
    const s2Rationales = {};
    
    // Modules mapped to implementation scope: 40 pts
    const modules = s2.purchased_modules || [];
    const moduleCount = modules.length;
    s2Score += moduleCount >= 3 ? 40 : (moduleCount === 2 ? 30 : (moduleCount === 1 ? 20 : 0));
    s2Rationales.modules_mapped = moduleCount >= 3 ? 
        `${moduleCount} modules identified → 40 pts` : 
        (moduleCount === 2 ? `${moduleCount} modules → 30 pts` : 
        (moduleCount === 1 ? `${moduleCount} module → 20 pts` : 'No modules identified → 0 pts'));
    
    // Add-ons / custom features scoped: 30 pts
    const addonsComplete = isComplete(s2.additional_addons);
    s2Score += addonsComplete ? 30 : (isPartial(s2.additional_addons) ? 15 : 0);
    s2Rationales.addons_scoped = addonsComplete ? 
        'Add-ons/custom features specified → 30 pts' : 
        (isPartial(s2.additional_addons) ? 'Partial add-ons info → 15 pts' : 'No add-ons specified → 0 pts');
    
    // Success criteria / acceptance defined: 30 pts
    // Using additional_addons as proxy for success criteria
    const successCriteriaComplete = isComplete(s2.additional_addons) && s2.additional_addons.length > 50;
    s2Score += successCriteriaComplete ? 30 : (isComplete(s2.additional_addons) ? 15 : 0);
    s2Rationales.success_criteria = successCriteriaComplete ? 
        'Success criteria/acceptance defined → 30 pts' : 
        (isComplete(s2.additional_addons) ? 'Partial success criteria → 15 pts' : 'Missing → 0 pts');
    
    rationales.section_2 = s2Rationales;
    
    // ============================================
    // SECTION 3: Template Readiness (100 pts)
    // ============================================
    let s3Score = 0;
    const s3Rationales = {};
    
    // Templates finalized ratio (bucket): 30 pts
    const totalTemplates = s3.template_count || 0;
    const finalizedTemplates = s3.templates_finalized_count || 0;
    let finalizedRatio = 0;
    if (totalTemplates > 0) {
        finalizedRatio = (finalizedTemplates / totalTemplates) * 100;
    }
    
    if (finalizedRatio >= 80) {
        s3Score += 30;
        s3Rationales.templates_finalized_ratio = `${finalizedTemplates} of ${totalTemplates} templates finalized → ${finalizedRatio.toFixed(1)}% → ≥80% bucket → 30 pts`;
    } else if (finalizedRatio >= 30) {
        s3Score += 15;
        s3Rationales.templates_finalized_ratio = `${finalizedTemplates} of ${totalTemplates} templates finalized → ${finalizedRatio.toFixed(1)}% → 30-79% bucket → 15 pts`;
    } else {
        s3Score += 0;
        s3Rationales.templates_finalized_ratio = totalTemplates > 0 ? 
            `${finalizedTemplates} of ${totalTemplates} templates finalized → ${finalizedRatio.toFixed(1)}% → <30% bucket → 0 pts` : 
            'Template count missing → 0 pts';
    }
    
    // Template editable formats available: 15 pts
    const formats = s3.template_formats || [];
    s3Score += formats.length > 0 ? 15 : 0;
    s3Rationales.template_formats = formats.length > 0 ? 
        `${formats.length} template format(s) specified → 15 pts` : 'No template formats specified → 0 pts';
    
    // Conditional logic complexity: 20 pts (simple=20, moderate=10, complex=0)
    const conditionalLogic = s3.conditional_logic || '';
    if (conditionalLogic.toLowerCase() === 'none' || conditionalLogic === '') {
        s3Score += 20;
        s3Rationales.conditional_logic = 'No conditional logic → 20 pts';
    } else if (conditionalLogic.toLowerCase().includes('simple')) {
        s3Score += 20;
        s3Rationales.conditional_logic = 'Simple conditional logic → 20 pts';
    } else if (conditionalLogic.toLowerCase().includes('moderate')) {
        s3Score += 10;
        s3Rationales.conditional_logic = 'Moderate conditional logic → 10 pts';
    } else if (conditionalLogic.toLowerCase().includes('complex')) {
        s3Score += 0;
        s3Rationales.conditional_logic = 'Complex conditional logic → 0 pts';
    } else {
        s3Score += 10; // Default to moderate if unclear
        s3Rationales.conditional_logic = 'Conditional logic specified (unclear complexity) → 10 pts';
    }
    
    // Clause library present: 15 pts (using clause_level_changes as proxy)
    const hasClauseLibrary = !s3.clause_level_changes; // If no clause changes needed, library likely exists
    s3Score += hasClauseLibrary ? 15 : 0;
    s3Rationales.clause_library = hasClauseLibrary ? 
        'Clause library present (no clause-level changes needed) → 15 pts' : 
        'Clause library missing or incomplete → 0 pts';
    
    // Approval matrices mapped: 10 pts
    const hasApprovalMatrices = s3.approval_matrices_exist;
    s3Score += hasApprovalMatrices ? 10 : 0;
    s3Rationales.approval_matrices = hasApprovalMatrices ? 
        'Approval matrices exist → 10 pts' : 'Approval matrices missing → 0 pts';
    
    // Volume impact: 10 pts (0-5 templates=10, 6-12=5, >12=0)
    if (totalTemplates >= 0 && totalTemplates <= 5) {
        s3Score += 10;
        s3Rationales.volume_impact = `${totalTemplates} templates → 0-5 bucket → 10 pts`;
    } else if (totalTemplates >= 6 && totalTemplates <= 12) {
        s3Score += 5;
        s3Rationales.volume_impact = `${totalTemplates} templates → 6-12 bucket → 5 pts`;
    } else if (totalTemplates > 12) {
        s3Score += 0;
        s3Rationales.volume_impact = `${totalTemplates} templates → >12 bucket → 0 pts`;
    } else {
        s3Rationales.volume_impact = 'Template count missing → 0 pts';
    }
    
    rationales.section_3 = s3Rationales;
    
    // ============================================
    // SECTION 4: Migration Readiness (100 pts)
    // ============================================
    let s4Score = 0;
    const s4Rationales = {};
    
    // Contract count clarity: 20 pts
    const contractCount = s4.contract_count || 0;
    s4Score += contractCount > 0 ? 20 : 0;
    s4Rationales.contract_count = contractCount > 0 ? 
        `Contract count specified: ${contractCount} → 20 pts` : 'Contract count missing → 0 pts';
    
    // Naming conventions/structured folders: 20 pts
    const structuredNaming = s4.structured_naming || '';
    if (structuredNaming.toLowerCase().includes('100%') || structuredNaming.toLowerCase().includes('yes-100%')) {
        s4Score += 20;
        s4Rationales.naming_conventions = '100% structured naming → 20 pts';
    } else if (structuredNaming.toLowerCase().includes('partial')) {
        s4Score += 10;
        s4Rationales.naming_conventions = 'Partial structured naming → 10 pts';
    } else {
        s4Score += 0;
        s4Rationales.naming_conventions = 'No structured naming → 0 pts';
    }
    
    // File formats usable (digital/OCR-able): 15 pts
    const contractFormats = s4.contract_formats || [];
    s4Score += contractFormats.length > 0 ? 15 : 0;
    s4Rationales.file_formats = contractFormats.length > 0 ? 
        `${contractFormats.length} usable format(s) specified → 15 pts` : 'No file formats specified → 0 pts';
    
    // Metadata availability (key fields): 25 pts
    const existingMetadata = s4.existing_metadata || '';
    if (existingMetadata.toLowerCase().includes('fully') || existingMetadata.toLowerCase().includes('yes-fully')) {
        s4Score += 25;
        s4Rationales.metadata_availability = 'Metadata fully available → 25 pts';
    } else if (existingMetadata.toLowerCase().includes('partially') || existingMetadata.toLowerCase().includes('yes-partially')) {
        s4Score += 12;
        s4Rationales.metadata_availability = 'Metadata partially available → 12 pts';
    } else {
        s4Score += 0;
        s4Rationales.metadata_availability = 'No metadata available → 0 pts';
    }
    
    // Contract types mapped to templates: 20 pts
    const contractTypes = s4.contract_types || '';
    s4Score += isComplete(contractTypes) ? 20 : (isPartial(contractTypes) ? 10 : 0);
    s4Rationales.contract_types = isComplete(contractTypes) ? 
        'Contract types mapped → 20 pts' : (isPartial(contractTypes) ? 'Partial contract types → 10 pts' : 'Missing → 0 pts');
    
    rationales.section_4 = s4Rationales;
    
    // ============================================
    // SECTION 5: Integration Readiness (100 pts)
    // ============================================
    let s5Score = 0;
    const s5Rationales = {};
    let s5Penalty = 0;
    
    // Systems + use-cases identified: 30 pts
    const systems = s5.systems_to_integrate || [];
    const systemCount = systems.length;
    s5Score += systemCount >= 2 ? 30 : (systemCount === 1 ? 20 : 0);
    s5Rationales.systems_identified = systemCount >= 2 ? 
        `${systemCount} systems identified → 30 pts` : 
        (systemCount === 1 ? `${systemCount} system identified → 20 pts` : 'No systems identified → 0 pts');
    
    // Technical access available (sandbox/API keys): 30 pts
    const hasApiAccess = s5.api_webhook_access;
    const adminAccess = s5.admin_access || '';
    const hasTechnicalAccess = hasApiAccess && (adminAccess.toLowerCase().includes('yes-all') || adminAccess.toLowerCase().includes('yes-some'));
    
    if (!hasTechnicalAccess && systemCount > 0) {
        // Blocking rule: No sandbox/technical access for critical integration → Section 5 = 0
        s5Score = 0;
        s5Rationales.technical_access = 'No technical access for required integrations → BLOCKING → Section 5 = 0';
    } else {
        s5Score += hasTechnicalAccess ? 30 : (hasApiAccess ? 15 : 0);
        s5Rationales.technical_access = hasTechnicalAccess ? 
            'Technical access available (API/webhook + admin access) → 30 pts' : 
            (hasApiAccess ? 'Partial technical access → 15 pts' : 'No technical access → 0 pts');
    }
    
    // Security/infosec approval status: 20 pts (partial if in-progress)
    const securityApproval = s5.security_approval || '';
    if (securityApproval.toLowerCase() === 'no' || securityApproval === '') {
        s5Score += 20;
        s5Rationales.security_approval = 'No security approval needed → 20 pts';
    } else if (securityApproval.toLowerCase().includes('not sure') || securityApproval.toLowerCase().includes('in-progress')) {
        s5Score += 10;
        s5Rationales.security_approval = 'Security approval in-progress → 10 pts';
    } else {
        s5Score += 5;
        s5Rationales.security_approval = 'Security approval pending → 5 pts';
    }
    
    // Integration owner identified: 10 pts
    const decisionMaker = s5.decision_maker || {};
    const hasOwner = isComplete(decisionMaker.name) || isComplete(decisionMaker.email);
    s5Score += hasOwner ? 10 : 0;
    s5Rationales.integration_owner = hasOwner ? 
        'Integration owner identified → 10 pts' : 'Integration owner missing → 0 pts';
    
    // Integration success metrics defined: 10 pts
    const outcomes = s5.expected_outcomes || [];
    s5Score += outcomes.length > 0 ? 10 : 0;
    s5Rationales.success_metrics = outcomes.length > 0 ? 
        `${outcomes.length} success metric(s) defined → 10 pts` : 'No success metrics defined → 0 pts';
    
    // Apply penalties for infosec not started for sensitive integrations
    if (systemCount > 0 && securityApproval.toLowerCase() !== 'no' && securityApproval !== '') {
        // Determine sensitivity based on system types
        const sensitiveSystems = ['salesforce', 'sap', 'oracle', 'workday', 'okta', 'azure', 'aws'];
        const hasSensitiveSystem = systems.some(s => sensitiveSystems.some(ss => s.toLowerCase().includes(ss)));
        
        if (hasSensitiveSystem) {
            if (securityApproval.toLowerCase().includes('not started') || securityApproval === '') {
                s5Penalty = -25; // High sensitivity
                s5Rationales.infosec_penalty = 'High-sensitivity integration without infosec approval → -25 pts penalty';
            } else if (securityApproval.toLowerCase().includes('in-progress')) {
                s5Penalty = -15; // Medium sensitivity
                s5Rationales.infosec_penalty = 'Medium-sensitivity integration with infosec in-progress → -15 pts penalty';
            }
        } else {
            if (securityApproval.toLowerCase().includes('not started') || securityApproval === '') {
                s5Penalty = -10; // Low sensitivity
                s5Rationales.infosec_penalty = 'Low-sensitivity integration without infosec approval → -10 pts penalty';
            }
        }
    }
    
    s5Score = Math.max(0, s5Score + s5Penalty); // Apply penalty, floor at 0
    
    rationales.section_5 = s5Rationales;
    
    // ============================================
    // SECTION 6: Business Process (100 pts)
    // ============================================
    let s6Score = 0;
    const s6Rationales = {};
    
    // Approval workflow documented: 35 pts
    const approvalWorkflow = s6.approval_workflow || '';
    if (approvalWorkflow.toLowerCase().includes('documented') || approvalWorkflow.toLowerCase().includes('yes-documented')) {
        s6Score += 35;
        s6Rationales.approval_workflow = 'Approval workflow documented → 35 pts';
    } else if (approvalWorkflow.toLowerCase().includes('informal') || approvalWorkflow.toLowerCase().includes('yes-informal')) {
        s6Score += 25;
        s6Rationales.approval_workflow = 'Approval workflow informal → 25 pts';
    } else {
        s6Score += 0;
        s6Rationales.approval_workflow = 'No approval workflow → 0 pts';
    }
    
    // Phase 1 must-haves defined: 25 pts
    const phase1MustHaves = s6.phase1_must_haves || '';
    s6Score += isComplete(phase1MustHaves) ? 25 : (isPartial(phase1MustHaves) ? 12 : 0);
    s6Rationales.phase1_must_haves = isComplete(phase1MustHaves) ? 
        'Phase 1 must-haves defined → 25 pts' : 
        (isPartial(phase1MustHaves) ? 'Partial Phase 1 must-haves → 12 pts' : 'Missing → 0 pts');
    
    // Key bottlenecks identified & mitigations: 20 pts
    const bottlenecks = s6.bottlenecks || '';
    s6Score += isComplete(bottlenecks) ? 20 : (isPartial(bottlenecks) ? 10 : 0);
    s6Rationales.bottlenecks = isComplete(bottlenecks) ? 
        'Bottlenecks identified with mitigations → 20 pts' : 
        (isPartial(bottlenecks) ? 'Partial bottlenecks info → 10 pts' : 'Missing → 0 pts');
    
    // Contract generation touchpoints mapped: 10 pts
    const generators = s6.contract_generators || [];
    s6Score += generators.length > 0 ? 10 : 0;
    s6Rationales.contract_generators = generators.length > 0 ? 
        `${generators.length} contract generator(s) mapped → 10 pts` : 'No contract generators mapped → 0 pts';
    
    // Workflow details (SLAs, frequency): 10 pts
    const workflowDetails = s6.workflow_details || '';
    s6Score += isComplete(workflowDetails) ? 10 : 0;
    s6Rationales.workflow_details = isComplete(workflowDetails) ? 
        'Workflow details (SLAs, frequency) provided → 10 pts' : 'Missing → 0 pts';
    
    rationales.section_6 = s6Rationales;
    
    // ============================================
    // SECTION 7: Security & Compliance (100 pts)
    // ============================================
    let s7Score = 0;
    const s7Rationales = {};
    
    // Security questionnaire status: 40 pts (completed=40, in-progress=20, not-started=0)
    const securityReview = s7.security_review || '';
    if (securityReview.toLowerCase().includes('completed') || securityReview.toLowerCase().includes('no')) {
        s7Score += 40;
        s7Rationales.security_questionnaire = securityReview.toLowerCase().includes('completed') ? 
            'Security questionnaire completed → 40 pts' : 'No security review needed → 40 pts';
    } else if (securityReview.toLowerCase().includes('in-progress') || securityReview.toLowerCase().includes('yes')) {
        s7Score += 20;
        s7Rationales.security_questionnaire = 'Security questionnaire in-progress → 20 pts';
    } else {
        s7Score += 0;
        s7Rationales.security_questionnaire = 'Security questionnaire not started → 0 pts';
    }
    
    // Data residency requirements defined: 30 pts
    const dataResidency = s7.data_residency || '';
    if (dataResidency.toLowerCase() === 'no' || dataResidency === '') {
        s7Score += 30;
        s7Rationales.data_residency = 'No data residency requirements → 30 pts';
    } else if (dataResidency.toLowerCase().includes('not sure')) {
        s7Score += 15;
        s7Rationales.data_residency = 'Data residency unclear → 15 pts';
    } else {
        s7Score += 10;
        s7Rationales.data_residency = 'Data residency requirements defined → 10 pts';
    }
    
    // Custom SSO/SCIM requirements: 20 pts
    const customSSO = s7.custom_sso || '';
    if (customSSO.toLowerCase() === 'no' || customSSO === '') {
        s7Score += 20;
        s7Rationales.custom_sso = 'No custom SSO/SCIM requirements → 20 pts';
    } else {
        s7Score += 10;
        s7Rationales.custom_sso = 'Custom SSO/SCIM required → 10 pts';
    }
    
    // Timeline for security reviews: 10 pts
    const securityReviews = s7.security_reviews_needed || [];
    s7Score += securityReviews.length > 0 ? 10 : 0;
    s7Rationales.security_reviews_timeline = securityReviews.length > 0 ? 
        'Security review timeline specified → 10 pts' : 'Missing → 0 pts';
    
    rationales.section_7 = s7Rationales;
    
    // ============================================
    // OVERALL SCORE CALCULATION
    // ============================================
    // Section weights: S1=10%, S2=10%, S3=25%, S4=20%, S5=20%, S6=10%, S7=5%
    const overallScore = Math.round(
        s1Score * 0.10 +
        s2Score * 0.10 +
        s3Score * 0.25 +
        s4Score * 0.20 +
        s5Score * 0.20 +
        s6Score * 0.10 +
        s7Score * 0.05
    );
    
    // Determine status
    let statusLabel, statusDescription;
    if (overallScore >= 85) {
        statusLabel = 'Ready to Proceed';
        statusDescription = 'Your organization is well-prepared for implementation. Minor items may need attention, but you\'re ready to move forward.';
    } else if (overallScore >= 70) {
        statusLabel = 'Ready with Minor Clarifications';
        statusDescription = 'Your organization is well-prepared for implementation. A few items need clarification before go-live.';
    } else if (overallScore >= 50) {
        statusLabel = 'Needs Preparation';
        statusDescription = 'Some preparation is needed before implementation can begin. Address the identified blockers first.';
    } else {
        statusLabel = 'Significant Preparation Required';
        statusDescription = 'Significant preparation is required before implementation. Please address the critical blockers identified.';
    }
    
    return {
        readiness_score: {
            overall: overallScore,
            breakdown: {
                account_stakeholder: s1Score,
                order_form_scope: s2Score,
                template_readiness: s3Score,
                migration_readiness: s4Score,
                integration_readiness: s5Score,
                business_process: s6Score,
                security_compliance: s7Score
            }
        },
        status_label: statusLabel,
        status_description: statusDescription,
        rationales: rationales
    };
}

/**
 * Calculate complete readiness assessment using deterministic scoring + Gemini AI for insights
 * Deterministic scoring provides explainable, consistent scores
 * Gemini AI generates insights, red flags, action items, and implementation plan
 */
async function calculateReadinessWithGemini(intake_responses) {
    if (!geminiModel) {
        throw new Error('Gemini model not available');
    }

    // First, calculate deterministic scores
    const deterministicResult = calculateDeterministicReadinessScore(intake_responses);
    const readinessScore = deterministicResult.readiness_score;
    const statusLabel = deterministicResult.status_label;
    const statusDescription = deterministicResult.status_description;
    const rationales = deterministicResult.rationales;

    // Calculate timeline confidence based on rules
    const overallScore = readinessScore.overall;
    const hasHighSeverityRedFlags = false; // Will be determined by Gemini
    let timelineConfidence = 'medium';
    if (overallScore >= 85 && !hasHighSeverityRedFlags) {
        timelineConfidence = 'high';
    } else if (overallScore >= 70 && !hasHighSeverityRedFlags) {
        timelineConfidence = 'medium';
    } else {
        timelineConfidence = 'low';
    }

    // Get current date for deadline calculations
    const today = new Date();
    const assessmentDate = today.toISOString().split('T')[0];
    
    // Helper function to get date N days from now
    function getDateDaysFromNow(days) {
        const date = new Date(today);
        date.setDate(date.getDate() + days);
        return date.toISOString().split('T')[0];
    }

    const prompt = `You are an expert implementation consultant for SpotDraft, a contract lifecycle management (CLM) platform. Your task is to analyze a comprehensive implementation readiness assessment and generate insights, identify risks, and create an implementation plan.

## REQUEST PAYLOAD (Input Data):
${JSON.stringify(intake_responses, null, 2)}

## DETERMINISTIC SCORES (Already Calculated):
The readiness scores have been calculated using deterministic rules. Use these scores to inform your analysis:

${JSON.stringify({
    overall_score: readinessScore.overall,
    section_scores: readinessScore.breakdown,
    status: statusLabel,
    status_description: statusDescription,
    scoring_rationales: rationales
}, null, 2)}

## YOUR TASKS:

### 1. RED FLAGS IDENTIFICATION
Identify critical issues that could block or delay implementation. Base your analysis on the provided scores and input data. For each red flag, provide:
- section: Which section it relates to
- issue: Brief description of the problem
- impact: How this affects the timeline/implementation
- severity: "high", "medium", or "low"

Focus on issues that:
- Are indicated by low section scores
- Are mentioned in the input data but not properly addressed
- Could cause delays or blockers
- Require immediate attention

Examples:
- Security review pending but not specified (if Section 7 score is low)
- Low ratio of finalized templates to total templates (if Section 3 score is low)
- No admin access for required integrations (if Section 5 score is low)
- Large migration volume with no structured naming (if Section 4 score is low)
- Missing critical POC information (if Section 1 score is low)
- Implementation start date in the past or unrealistic timeline
- No merged templates strategy for similar contract types

### 2. ACTION ITEMS
Create actionable tasks for both customer and SpotDraft teams based on the scores and identified issues. For each item:
- task: Specific action to take
- section: Related section name (e.g., "Account & Stakeholders", "Template Readiness")
- priority: "high", "medium", or "low" (based on severity and score impact)
- deadline: Suggested date (YYYY-MM-DD format)
  - High priority → ${getDateDaysFromNow(7)} (7 days from assessment)
  - Medium priority → ${getDateDaysFromNow(14)} (14 days from assessment)
  - Low priority → ${getDateDaysFromNow(28)} (28 days from assessment)
- owner: Who should handle it ("Customer" or "SpotDraft")

### 3. IMPLEMENTATION PLAN
Create a comprehensive, score-driven phased implementation plan. Use the section scores to determine readiness, timeline, and phase structure.

**Base Timeline Calculation:**
- Start with 8-12 weeks from ${assessmentDate} as baseline
- Adjust based on section scores:
  - If overall score ≥ 85: 8-10 weeks (optimistic timeline)
  - If overall score 70-84: 10-12 weeks (standard timeline)
  - If overall score 50-69: 12-16 weeks (extended timeline for preparation)
  - If overall score < 50: 16-20 weeks (significant preparation needed)

**Timeline Adjustments:**
- Add 2-4 weeks if Section 3 (Template Readiness) score < 60
- Add 2-3 weeks if Section 4 (Migration Readiness) score < 60
- Add 3-5 weeks if Section 5 (Integration Readiness) score < 60
- Add 1-2 weeks if Section 7 (Security & Compliance) score < 50
- Add 1 week for each high-severity red flag

**Phase Structure (Create 4-6 phases):**
1. **Phase 1: Discovery & Setup** (Week 1-2)
   - Kickoff meetings, stakeholder alignment
   - System access and permissions setup
   - Project plan finalization
   - Status: Based on Section 1 score (Account & Stakeholders)
     - Score ≥ 80: "Ready"
     - Score 60-79: "Partially ready"
     - Score < 60: "Blocked"

2. **Phase 2: Template Configuration** (Week 2-5)
   - Template design and configuration
   - Conditional logic setup
   - Approval matrix configuration
   - Status: Based on Section 3 score (Template Readiness)
     - Score ≥ 80: "Ready"
     - Score 60-79: "Partially ready" (may need template finalization first)
     - Score < 60: "Blocked" (templates need to be finalized)

3. **Phase 3: Integration Setup** (Week 3-6, parallel with Phase 2 if possible)
   - System integrations configuration
   - API/webhook setup
   - Security approvals
   - Status: Based on Section 5 score (Integration Readiness)
     - Score ≥ 80: "Ready"
     - Score 60-79: "Partially ready" (may need security approvals)
     - Score < 60: "Blocked" (technical access or approvals missing)

4. **Phase 4: Migration Preparation** (Week 4-7)
   - Data mapping and validation
   - Migration scripts/tools setup
   - Test migration runs
   - Status: Based on Section 4 score (Migration Readiness)
     - Score ≥ 80: "Ready"
     - Score 60-79: "Partially ready" (may need data cleanup)
     - Score < 60: "Blocked" (data structure issues)

5. **Phase 5: Testing & Training** (Week 7-10)
   - User acceptance testing
   - Training sessions
   - Process documentation
   - Status: Based on Section 6 score (Business Process)
     - Score ≥ 80: "Ready"
     - Score 60-79: "Partially ready"
     - Score < 60: "Blocked" (workflow not defined)

6. **Phase 6: Go-Live & Support** (Week 10-12)
   - Production deployment
   - Go-live support
   - Post-launch optimization
   - Status: "Scheduled" (depends on all previous phases)

**For each phase, provide:**
- phase: Phase number (1, 2, 3, etc.)
- name: Descriptive phase name
- duration: Specific week range (e.g., "Week 1-2", "Week 3-5")
- activities: Array of 5-8 specific, actionable activities for this phase
- dependencies: What must be completed first (null if no dependencies, or list specific phases/activities)
- status: "Ready", "Partially ready", "Blocked", or "Scheduled" (based on relevant section scores and red flags)

**Implementation Plan JSON Structure:**
{
  "recommended_go_live": "<YYYY-MM-DD>",
  "timeline_adjusted": <boolean>,
  "adjustment_reason": "<string or null>",
  "phases": [
    {
      "phase": <integer>,
      "name": "<string>",
      "duration": "<string>",
      "activities": ["<string>", ...],
      "dependencies": "<string or null>",
      "status": "<Ready|Partially ready|Blocked|Scheduled>"
    }
  ]
}

### 4. AI INSIGHTS
Provide strategic insights based on the scores and input data:
- key_strengths: 2-3 main strengths (focus on sections with high scores)
- critical_concerns: 2-3 main concerns (focus on sections with low scores or identified issues)
- recommendations: 2-3 priority recommendations (actionable steps to improve readiness)
- risk_assessment: Brief risk assessment (1-2 sentences) based on overall score and red flags
- timeline_confidence: "${timelineConfidence}" (already calculated based on overall score: ${overallScore >= 85 ? 'high' : overallScore >= 70 ? 'medium' : 'low'})

## RESPONSE PAYLOAD (Required JSON Format):
Return ONLY valid JSON in this exact structure (no markdown, no explanations):
NOTE: Do NOT include readiness_score, status_label, or status_description - these are already calculated deterministically.

{
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
                "owner": "<string>"
            }
        ],
        "spotdraft": [
            {
                "task": "<string>",
                "section": "<string>",
                "priority": "<high|medium|low>",
                "deadline": "<YYYY-MM-DD>",
                "owner": "<string>"
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
                "duration": "<string>",
                "activities": ["<string>"],
                "dependencies": "<string or null>",
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
        
        // Merge deterministic scores with Gemini-generated insights
        return {
            readiness_score: readinessScore, // Use deterministic scores
            status_label: statusLabel, // Use deterministic status
            status_description: statusDescription, // Use deterministic description
            rationales: rationales, // Include scoring rationales for explainability
            red_flags: assessmentData.red_flags || [],
            action_items: assessmentData.action_items || { customer: [], spotdraft: [] },
            implementation_plan: assessmentData.implementation_plan,
            ai_insights: {
                ...assessmentData.ai_insights,
                timeline_confidence: timelineConfidence // Use deterministic timeline confidence
            },
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
