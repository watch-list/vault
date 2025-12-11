// PromptVault - JavaScript Module
// Store prompts and images in localStorage and load from data.js

let prompts = [];
let currentViewId = null;

// Storage key constant
const STORAGE_KEY = 'promptvault_prompts';

// Check if localStorage is available
function isLocalStorageAvailable() {
    try {
        const testKey = '__test__';
        localStorage.setItem(testKey, testKey);
        localStorage.removeItem(testKey);
        return true;
    } catch (e) {
        return false;
    }
}

// Initialize the app
function init() {
    console.log('Initializing PromptVault...');
    
    // Check localStorage availability
    if (!isLocalStorageAvailable()) {
        console.error('localStorage is not available!');
        showToast('⚠️ Storage not available. Data won\'t save.');
    } else {
        console.log('Storage is available.');
    }
    
    loadPrompts();
    renderPrompts();
    setupEventListeners();
}

// Load prompts from localStorage AND data.js
function loadPrompts() {
    let localPrompts = [];
    let staticPrompts = [];

    // 1. Load from data.js (Permanent)
    if (typeof PERMANENT_PROMPTS !== 'undefined' && Array.isArray(PERMANENT_PROMPTS)) {
        staticPrompts = PERMANENT_PROMPTS;
        console.log('Loaded ' + staticPrompts.length + ' static prompts from data.js');
    }

    // 2. Load from localStorage (User/Temporary)
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed)) {
                localPrompts = parsed;
                console.log('Loaded ' + localPrompts.length + ' local prompts from storage');
            }
        }
    } catch (e) {
        console.error('Error loading local prompts:', e);
    }

    // 3. Merge: Static prompts take precedence, then local.
    const promptMap = new Map();

    // Add static first
    staticPrompts.forEach(p => promptMap.set(p.id, { ...p, isStatic: true }));

    // Add/Overwrite with local (if ID matches, local overwrites which allows editing)
    localPrompts.forEach(p => promptMap.set(p.id, p));

    // Convert back to array
    prompts = Array.from(promptMap.values());
    
    // Sort by date (newest first)
    prompts.sort(function(a, b) {
        return (b.createdAt || 0) - (a.createdAt || 0);
    });

    console.log('Total prompts merged:', prompts.length);
}

// Generate code for data.js
function copyForDataJS() {
    if (prompts.length === 0) {
        showToast('No prompts to copy');
        return;
    }

    // Clean up objects
    const cleanPrompts = prompts.map(p => ({
        id: p.id,
        text: p.text,
        image: p.image,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
    }));

    const jsonString = JSON.stringify(cleanPrompts, null, 4);
    const codeContent = `const PERMANENT_PROMPTS = ${jsonString};`;

    navigator.clipboard.writeText(codeContent).then(() => {
        showToast('Code copied! Paste into data.js');
    }).catch(err => {
        console.error('Copy failed:', err);
        showToast('Copy failed. See console.');
    });
}

// Export prompts to JSON file
function exportPrompts() {
    if (prompts.length === 0) {
        showToast('No prompts to export');
        return;
    }
    
    try {
        const dataStr = JSON.stringify(prompts, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'promptvault_backup_' + new Date().toISOString().slice(0, 10) + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast('Exported ' + prompts.length + ' prompts!');
    } catch (e) {
        console.error('Export error:', e);
        showToast('Export failed');
    }
}

// Import prompts from JSON file
function importPrompts(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const importedData = JSON.parse(e.target.result);
            
            if (!Array.isArray(importedData)) {
                showToast('Invalid file format');
                return;
            }
            
            // Validate
            const validPrompts = importedData.filter(function(p) {
                return p.id && p.text && p.image;
            });
            
            if (validPrompts.length === 0) {
                showToast('No valid prompts found');
                return;
            }
            
            const action = confirm(
                'Found ' + validPrompts.length + ' prompts.\n\n' +
                'OK = Merge with existing prompts\n' +
                'Cancel = Replace all local prompts'
            );
            
            if (action) {
                const existingIds = prompts.map(p => p.id);
                validPrompts.forEach(p => {
                    if (!existingIds.includes(p.id)) {
                        prompts.push(p);
                    }
                });
            } else {
                prompts = validPrompts;
            }
            
            saveToStorage();
            loadPrompts();
            renderPrompts();
            showToast('Import successful!');
            
        } catch (err) {
            console.error('Import error:', err);
            showToast('Failed to read file');
        }
    };
    
    reader.onerror = function() {
        showToast('Error reading file');
    };
    
    reader.readAsText(file);
    event.target.value = '';
}

// Save prompts to localStorage
function saveToStorage() {
    try {
        const dataToSave = JSON.stringify(prompts);
        localStorage.setItem(STORAGE_KEY, dataToSave);
        
        // Verify
        const verification = localStorage.getItem(STORAGE_KEY);
        if (verification === dataToSave) {
            console.log('Successfully saved ' + prompts.length + ' prompts');
            updatePromptCount();
            return true;
        } else {
            console.error('Save verification failed!');
            showToast('Save verification failed');
            return false;
        }
    } catch (e) {
        console.error('Error saving prompts:', e);
        if (e.name === 'QuotaExceededError') {
            showToast('Storage full! Delete some prompts.');
        } else {
            showToast('Error saving: ' + e.message);
        }
        return false;
    }
}

// Update prompt count display
function updatePromptCount() {
    const countEl = document.getElementById('promptCount');
    if (countEl) {
        countEl.textContent = prompts.length > 0 ? '(' + prompts.length + ' saved)' : '';
    }
}

// Render all prompt cards
function renderPrompts() {
    const grid = document.getElementById('promptsGrid');
    const emptyState = document.getElementById('emptyState');
    
    updatePromptCount();

    if (prompts.length === 0) {
        grid.classList.add('hidden');
        emptyState.classList.remove('hidden');
        return;
    }

    grid.classList.remove('hidden');
    emptyState.classList.add('hidden');

    grid.innerHTML = prompts.map(prompt => `
        <div class="card rounded-3xl overflow-hidden cursor-pointer group relative" onclick="openViewModal('${prompt.id}')">
            <div class="image-container overflow-hidden bg-gray-900">
                <img src="${prompt.image}" alt="Prompt image" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition duration-500" onerror="this.src='https://placehold.co/400x500/1e1e2e/FFF?text=Image+Error'">
            </div>
            ${prompt.isStatic ? '<div class="absolute top-2 right-2 bg-purple-500/80 text-white text-[10px] px-2 py-1 rounded-full backdrop-blur-sm shadow-lg">Static</div>' : ''}
            <div class="p-4">
                <p class="text-gray-300 text-sm line-clamp-2 mb-3">${escapeHtml(prompt.text)}</p>
                <button onclick="event.stopPropagation(); copyPrompt('${prompt.id}')" class="w-full btn-ghost py-2 rounded-xl text-sm flex items-center justify-center gap-2 text-purple-400 group-hover:bg-purple-500/10 transition-colors">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/>
                    </svg>
                    Copy
                </button>
            </div>
        </div>
    `).join('');
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Handle URL Input Change
function handleUrlInput(url) {
    const previewContainer = document.getElementById('imagePreviewContainer');
    const previewImage = document.getElementById('imagePreview');
    
    if (url && url.length > 5) {
        previewImage.src = url;
        previewContainer.classList.remove('hidden');
    } else {
        previewContainer.classList.add('hidden');
    }
}

// Handle Image Load Error in Preview
function handleImageError(img) {
    // Optional: Hide preview or show placeholder if URL is bad
    // img.src = 'https://placehold.co/400x500/1e1e2e/FFF?text=Invalid+URL';
}

// Open add/edit modal
function openModal(editId = null) {
    const modal = document.getElementById('modal');
    const title = document.getElementById('modalTitle');
    const promptText = document.getElementById('promptText');
    const imageUrl = document.getElementById('imageUrl');
    const editIdInput = document.getElementById('editId');

    modal.classList.remove('hidden');
    modal.classList.add('flex');

    if (editId) {
        const prompt = prompts.find(p => p.id === editId);
        if (prompt) {
            title.textContent = 'Edit Prompt';
            editIdInput.value = editId;
            promptText.value = prompt.text;
            imageUrl.value = prompt.image;
            handleUrlInput(prompt.image);
        }
    } else {
        title.textContent = 'Add New Prompt';
        promptText.value = '';
        imageUrl.value = '';
        editIdInput.value = '';
        handleUrlInput('');
    }
}

// Close add/edit modal
function closeModal() {
    document.getElementById('modal').classList.add('hidden');
    document.getElementById('modal').classList.remove('flex');
    document.getElementById('promptText').value = '';
    document.getElementById('imageUrl').value = '';
    document.getElementById('editId').value = '';
    handleUrlInput('');
}

// Save prompt (add or edit)
function savePrompt(event) {
    if (event) {
        event.preventDefault();
    }

    const editId = document.getElementById('editId').value;
    const text = document.getElementById('promptText').value.trim();
    const image = document.getElementById('imageUrl').value.trim();

    if (!text) {
        showToast('Please enter a prompt');
        return false;
    }

    if (!image) {
        showToast('Please enter an image URL');
        return false;
    }

    if (editId) {
        const index = prompts.findIndex(p => p.id === editId);
        if (index !== -1) {
            prompts[index] = {
                ...prompts[index],
                text: text,
                image: image,
                updatedAt: Date.now()
            };
        }
    } else {
        const newPrompt = {
            id: 'prompt_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
            text: text,
            image: image,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        prompts.unshift(newPrompt);
    }

    if (saveToStorage()) {
        renderPrompts();
        closeModal();
        showToast(editId ? 'Prompt updated!' : 'Prompt saved!');
    }

    return false;
}

// Open view modal
function openViewModal(id) {
    currentViewId = id;
    const prompt = prompts.find(p => p.id === id);

    if (prompt) {
        document.getElementById('viewImage').src = prompt.image;
        document.getElementById('viewPrompt').textContent = prompt.text;
        document.getElementById('viewModal').classList.remove('hidden');
        document.getElementById('viewModal').classList.add('flex');
    }
}

// Close view modal
function closeViewModal() {
    document.getElementById('viewModal').classList.add('hidden');
    document.getElementById('viewModal').classList.remove('flex');
    currentViewId = null;
}

// Copy prompt text
function copyPrompt(id) {
    const prompt = prompts.find(p => p.id === id);
    if (prompt) {
        navigator.clipboard.writeText(prompt.text).then(function() {
            showToast('Copied!');
        }).catch(function() {
            fallbackCopy(prompt.text);
        });
    }
}

function copyViewPrompt() {
    if (currentViewId) {
        copyPrompt(currentViewId);
    }
}

function fallbackCopy(text) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
        document.execCommand('copy');
        showToast('Copied!');
    } catch (e) {
        showToast('Copy failed');
    }
    document.body.removeChild(textarea);
}

// Edit from view modal
function editFromView() {
    const id = currentViewId;
    closeViewModal();
    setTimeout(function() {
        openModal(id);
    }, 200);
}

// Share/Download single prompt
function sharePrompt() {
    if (!currentViewId) return;
    const prompt = prompts.find(p => p.id === currentViewId);
    if (!prompt) return;

    const textContent = `PROMPT:\n${prompt.text}\n\nIMAGE URL:\n${prompt.image}`;
    const blob = new Blob([textContent], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `prompt_${prompt.id.slice(-6)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded text file');
}

// Delete from view modal
function deleteFromView() {
    if (confirm('Delete this prompt?')) {
        prompts = prompts.filter(p => p.id !== currentViewId);
        saveToStorage();
        renderPrompts();
        closeViewModal();
        showToast('Deleted!');
    }
}

// Show toast notification
function showToast(message) {
    const toast = document.getElementById('toast');
    document.getElementById('toastMessage').textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(function() {
        toast.classList.add('hidden');
    }, 2000);
}

// Setup event listeners
function setupEventListeners() {
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape') {
            closeModal();
            closeViewModal();
        }
    });

    document.getElementById('modal').addEventListener('click', function(e) {
        if (e.target.id === 'modal') {
            closeModal();
        }
    });

    document.getElementById('viewModal').addEventListener('click', function(e) {
        if (e.target.id === 'viewModal') {
            closeViewModal();
        }
    });

    // Form submit handler
    document.getElementById('promptForm').addEventListener('submit', function(e) {
        savePrompt(e);
    });
}

// Start
document.addEventListener('DOMContentLoaded', init);