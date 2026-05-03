import * as pdfjsLib from 'pdfjs-dist';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Constants
const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const API_KEY = import.meta.env.VITE_GROQ_API_KEY;

// State
let selectedFile = null;
let resumeText = '';

// Generator State
let selectedIndustry = null;
let selectedRole = null;

const industryData = {
    'Tech': ['Software Engineer', 'Data Scientist', 'Product Manager', 'DevOps Engineer', 'UI/UX Designer', 'Cybersecurity Analyst'],
    'Healthcare': ['Registered Nurse', 'Medical Assistant', 'Pharmacist', 'Healthcare Administrator', 'Physical Therapist'],
    'Finance': ['Financial Analyst', 'Accountant', 'Investment Banker', 'Loan Officer', 'Risk Manager'],
    'Education': ['Teacher', 'Academic Advisor', 'Instructional Designer', 'Education Consultant'],
    'Creative': ['Graphic Designer', 'Content Writer', 'Video Editor', 'Marketing Specialist', 'Art Director']
};

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const resumeUpload = document.getElementById('resume-upload');
const browseBtn = document.getElementById('browse-btn');
const fileInfo = document.getElementById('file-info');
const fileNameDisplay = fileInfo.querySelector('.file-name');
const removeFileBtn = document.getElementById('remove-file');
const jdTextarea = document.getElementById('job-description');

// Toggle Groups
const depthBtns = document.querySelectorAll('#depth-group .toggle-btn');
const goalBtns = document.querySelectorAll('#goal-group .toggle-btn');
let currentDepth = 'standard';
let currentGoal = 'general';

const analyzeBtn = document.getElementById('analyze-btn');
const resultsSection = document.getElementById('results');
const matchScoreDisplay = document.getElementById('match-score');
const strengthsList = document.getElementById('strengths-list');
const weaknessesList = document.getElementById('weaknesses-list');
const detailedFeedback = document.getElementById('detailed-feedback');
const resetBtn = document.getElementById('reset-btn');
const copyBtn = document.getElementById('copy-btn');
const exportPdfBtn = document.getElementById('export-pdf-btn');

// Modals
const aboutBtn = document.getElementById('about-btn');
const helpBtn = document.getElementById('help-btn');
const aboutModal = document.getElementById('about-modal');
const helpModal = document.getElementById('help-modal');
const closeBtns = document.querySelectorAll('.close-modal');

// Navigation & Views
const navAnalyzer = document.getElementById('nav-analyzer');
const navGenerator = document.getElementById('nav-generator');
const analyzerView = document.getElementById('analyzer-view');
const generatorView = document.getElementById('generator-view');

// Generator Elements
const industryGrid = document.getElementById('industry-grid');
const roleStep = document.getElementById('role-step');
const roleGrid = document.getElementById('role-grid');
const customRoleInput = document.getElementById('custom-role');
const generateJdBtn = document.getElementById('generate-jd-btn');
const generatedResult = document.getElementById('generated-result');
const generatedJdText = document.getElementById('generated-jd-text');
const useJdBtn = document.getElementById('use-jd-btn');
const resetGenBtn = document.getElementById('reset-gen-btn');

// --- Event Listeners ---

// File Upload Logic
browseBtn.addEventListener('click', () => resumeUpload.click());

resumeUpload.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
});

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('active');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('active');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('active');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
});

removeFileBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    resumeText = '';
    fileInfo.classList.add('hidden');
    dropZone.querySelector('.upload-content').classList.remove('hidden');
    resumeUpload.value = '';
});

// Analysis Logic
analyzeBtn.addEventListener('click', startAnalysis);

resetBtn.addEventListener('click', () => {
    resultsSection.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
});

copyBtn.addEventListener('click', () => {
    const analysisText = resultsSection.innerText;
    navigator.clipboard.writeText(analysisText).then(() => {
        const originalText = copyBtn.innerText;
        copyBtn.innerText = 'Copied!';
        setTimeout(() => copyBtn.innerText = originalText, 2000);
    });
});

exportPdfBtn.addEventListener('click', exportToPDF);

// Toggle Buttons Logic
depthBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        depthBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentDepth = btn.dataset.value;
    });
});

goalBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        goalBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentGoal = btn.dataset.value;
    });
});

// Modal Logic
aboutBtn.addEventListener('click', () => aboutModal.classList.remove('hidden'));
helpBtn.addEventListener('click', () => helpModal.classList.remove('hidden'));

closeBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
        e.target.closest('.modal').classList.add('hidden');
    });
});

document.querySelectorAll('.modal').forEach(modal => {
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.add('hidden');
    });
});

// View Navigation
navAnalyzer.addEventListener('click', () => switchView('analyzer'));
navGenerator.addEventListener('click', () => switchView('generator'));

// Generator Logic
generateJdBtn.addEventListener('click', handleGenerateJD);
useJdBtn.addEventListener('click', transferGeneratedJD);
resetGenBtn.addEventListener('click', resetGenerator);

customRoleInput.addEventListener('input', () => {
    if (customRoleInput.value.trim()) {
        document.querySelectorAll('#role-grid .selection-card').forEach(c => c.classList.remove('active'));
        selectedRole = customRoleInput.value.trim();
    }
});

// --- Core Functions ---

async function handleFile(file) {
    if (!file.type.match('application/pdf')) {
        alert('Please upload a PDF file.');
        return;
    }

    selectedFile = file;
    fileNameDisplay.innerText = file.name;
    fileInfo.classList.remove('hidden');
    dropZone.querySelector('.upload-content').classList.add('hidden');

    try {
        resumeText = await extractPdfText(file);
        console.log('Resume text extracted:', resumeText.substring(0, 100) + '...');
    } catch (error) {
        console.error('Text extraction failed:', error);
        alert('Failed to extract text from the PDF file.');
    }
}

async function extractPdfText(file) {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = '';
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        text += content.items.map(item => item.str).join(' ') + '\n';
    }
    return text;
}

async function startAnalysis() {
    const finalResumeText = resumeText.trim();

    if (!finalResumeText) {
        alert('Please upload a PDF resume.');
        return;
    }

    const jdText = jdTextarea.value.trim();
    const depth = currentDepth;
    const goal = currentGoal;

    if (!API_KEY || API_KEY === 'your_groq_api_key_here') {
        alert('Service unavailable: AI API key is not configured by the administrator.');
        return;
    }

    setLoading(true);

    try {
        const feedback = await fetchAIAnalysis(finalResumeText, jdText, depth, goal);
        displayResults(feedback);
    } catch (error) {
        console.error('Analysis failed:', error);
        alert('Something went wrong during analysis. Check the console for details.');
    } finally {
        setLoading(false);
    }
}

async function fetchAIAnalysis(resume, jd, depth, goal) {
    const systemPrompt = `You are an expert career coach and technical recruiter. 
    Analyze the provided resume. If a job description is provided, compare the resume against it.
    Return the analysis in structured JSON format with the following keys:
    - matchScore: integer (0-100)
    - strengths: array of strings
    - weaknesses: array of strings
    - recommendations: array of strings
    - breakdowns: object with keys 'Clarity', 'Formatting', 'Keywords', 'Impact' (each value is a string summary)
    
    Depth: ${depth}
    User Goal: ${goal}`;

    const userPrompt = `
    RESUME TEXT:
    ${resume}
    
    ${jd ? `JOB DESCRIPTION:\n${jd}` : 'NO JOB DESCRIPTION PROVIDED.'}
    `;

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error?.message || 'API call failed');
    }

    const data = await response.json();
    return JSON.parse(data.choices[0].message.content);
}

function displayResults(data) {
    matchScoreDisplay.innerText = `${data.matchScore}%`;

    strengthsList.innerHTML = data.strengths.map(s => `<div>${s}</div>`).join('');
    weaknessesList.innerHTML = data.weaknesses.map(w => `<div>${w}</div>`).join('');

    detailedFeedback.innerHTML = '';
    for (const [title, content] of Object.entries(data.breakdowns)) {
        const section = document.createElement('div');
        section.className = 'result-section-card';
        section.innerHTML = `
            <h4>${title}</h4>
            <p>${content}</p>
        `;
        detailedFeedback.appendChild(section);
    }

    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth' });
}

function setLoading(isLoading) {
    analyzeBtn.disabled = isLoading;
    const btnText = analyzeBtn.querySelector('.btn-text');
    const spinner = analyzeBtn.querySelector('.btn-spinner');
    
    if (isLoading) {
        btnText.innerText = 'Analyzing...';
        spinner.classList.remove('hidden');
    } else {
        btnText.innerText = 'Analyze';
        spinner.classList.add('hidden');
    }
}

async function exportToPDF() {
    const originalText = exportPdfBtn.innerText;
    exportPdfBtn.innerText = 'Preparing...';
    
    // Ensure the results section is visible and add PDF-specific class
    resultsSection.classList.add('pdf-export-mode');
    
    // Give the browser a moment to apply the styles
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const options = {
        margin: [10, 10],
        filename: `Rescreen_Analysis_${new Date().toISOString().slice(0,10)}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { 
            scale: 2, 
            useCORS: true,
            logging: false,
            letterRendering: true,
            windowWidth: resultsSection.scrollWidth,
            windowHeight: resultsSection.scrollHeight
        },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    try {
        // Use a more explicit promise chain for html2pdf
        const element = resultsSection;
        await html2pdf().set(options).from(element).save();
    } catch (error) {
        console.error('PDF Export failed:', error);
        alert('Failed to generate PDF. Please try again.');
    } finally {
        resultsSection.classList.remove('pdf-export-mode');
        exportPdfBtn.innerText = originalText;
    }
}

// --- Generator Functions ---

function switchView(view) {
    if (view === 'analyzer') {
        analyzerView.classList.remove('hidden');
        generatorView.classList.add('hidden');
        navAnalyzer.classList.add('active-nav');
        navGenerator.classList.remove('active-nav');
    } else {
        analyzerView.classList.add('hidden');
        generatorView.classList.remove('hidden');
        navAnalyzer.classList.remove('active-nav');
        navGenerator.classList.add('active-nav');
        if (industryGrid.children.length === 0) populateIndustries();
    }
}

function populateIndustries() {
    industryGrid.innerHTML = '';
    Object.keys(industryData).forEach(industry => {
        const card = document.createElement('div');
        card.className = 'selection-card';
        card.innerText = industry;
        card.addEventListener('click', () => selectIndustry(industry, card));
        industryGrid.appendChild(card);
    });
}

function selectIndustry(industry, card) {
    document.querySelectorAll('#industry-grid .selection-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    selectedIndustry = industry;
    selectedRole = null;
    customRoleInput.value = '';
    
    populateRoles(industry);
    roleStep.classList.remove('hidden');
    generatedResult.classList.add('hidden');
    
    roleStep.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function populateRoles(industry) {
    roleGrid.innerHTML = '';
    industryData[industry].forEach(role => {
        const card = document.createElement('div');
        card.className = 'selection-card';
        card.innerText = role;
        card.addEventListener('click', () => {
            document.querySelectorAll('#role-grid .selection-card').forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            selectedRole = role;
            customRoleInput.value = '';
        });
        roleGrid.appendChild(card);
    });
}

async function handleGenerateJD() {
    const role = selectedRole || customRoleInput.value.trim();
    if (!role) {
        alert('Please select or type a job role.');
        return;
    }

    setGenLoading(true);
    try {
        const jd = await fetchGeneratedJD(role, selectedIndustry);
        generatedJdText.value = jd;
        generatedResult.classList.remove('hidden');
        generatedResult.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Generation failed:', error);
        alert('Failed to generate job description.');
    } finally {
        setGenLoading(false);
    }
}

async function fetchGeneratedJD(role, industry) {
    const systemPrompt = `You are an expert technical recruiter. 
    Generate a professional, comprehensive job description for the role provided.
    Include sections for: Role Summary, Key Responsibilities, and Required Qualifications/Skills.
    Keep it realistic and industry-standard. Do not include placeholders like [Company Name].`;

    const userPrompt = `Role: ${role}${industry ? `\nIndustry: ${industry}` : ''}`;

    const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            model: "llama-3.3-70b-versatile",
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7
        })
    });

    if (!response.ok) throw new Error('API call failed');
    const data = await response.json();
    return data.choices[0].message.content;
}

function transferGeneratedJD() {
    jdTextarea.value = generatedJdText.value;
    switchView('analyzer');
    jdTextarea.scrollIntoView({ behavior: 'smooth' });
    
    // Add a little pulse effect to the textarea to show it's updated
    jdTextarea.style.boxShadow = '0 0 0 4px rgba(79, 70, 229, 0.3)';
    setTimeout(() => jdTextarea.style.boxShadow = '', 2000);
}

function resetGenerator() {
    selectedIndustry = null;
    selectedRole = null;
    customRoleInput.value = '';
    document.querySelectorAll('.selection-card').forEach(c => c.classList.remove('active'));
    roleStep.classList.add('hidden');
    generatedResult.classList.add('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function setGenLoading(isLoading) {
    generateJdBtn.disabled = isLoading;
    const btnText = generateJdBtn.querySelector('.btn-text');
    const spinner = generateJdBtn.querySelector('.btn-spinner');
    
    if (isLoading) {
        btnText.innerText = 'Generating...';
        spinner.classList.remove('hidden');
    } else {
        btnText.innerText = 'Generate Description';
        spinner.classList.add('hidden');
    }
}
