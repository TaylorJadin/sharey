// State Management
const state = {
    currentTool: null,
    isDrawing: false,
    startX: 0,
    startY: 0,
    currentColor: '#ff0000',
    strokeWidth: 3,
    annotations: [],
    stepCounter: 1,
    imageData: null,
    originalImage: null,
    isRecording: false,
    mediaRecorder: null,
    recordedChunks: [],
    recordingStartTime: null,
    timerInterval: null,
    cropSelection: null,
    isCropping: false
};

// DOM Elements
const elements = {
    screenshotBtn: document.getElementById('screenshotBtn'),
    recordBtn: document.getElementById('recordBtn'),
    recordBtnText: document.getElementById('recordBtnText'),
    recordingTimer: document.getElementById('recordingTimer'),
    timerText: document.getElementById('timerText'),
    editorSection: document.getElementById('editorSection'),
    editorCanvas: document.getElementById('editorCanvas'),
    cropTool: document.getElementById('cropTool'),
    boxTool: document.getElementById('boxTool'),
    arrowTool: document.getElementById('arrowTool'),
    stepTool: document.getElementById('stepTool'),
    colorPicker: document.getElementById('colorPicker'),
    strokeWidth: document.getElementById('strokeWidth'),
    undoBtn: document.getElementById('undoBtn'),
    clearBtn: document.getElementById('clearBtn'),
    copyBtn: document.getElementById('copyBtn'),
    downloadBtn: document.getElementById('downloadBtn'),
    saveLocalBtn: document.getElementById('saveLocalBtn'),
    closeEditorBtn: document.getElementById('closeEditorBtn'),
    libraryGrid: document.getElementById('libraryGrid'),
    toast: document.getElementById('toast')
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeEventListeners();
    loadLibrary();
});

// Event Listeners
function initializeEventListeners() {
    elements.screenshotBtn.addEventListener('click', captureScreenshot);
    elements.recordBtn.addEventListener('click', toggleRecording);
    elements.cropTool.addEventListener('click', () => selectTool('crop'));
    elements.boxTool.addEventListener('click', () => selectTool('box'));
    elements.arrowTool.addEventListener('click', () => selectTool('arrow'));
    elements.stepTool.addEventListener('click', () => selectTool('step'));
    elements.colorPicker.addEventListener('change', (e) => {
        state.currentColor = e.target.value;
    });
    elements.strokeWidth.addEventListener('change', (e) => {
        state.strokeWidth = parseInt(e.target.value);
    });
    elements.undoBtn.addEventListener('click', undoLastAnnotation);
    elements.clearBtn.addEventListener('click', clearAllAnnotations);
    elements.copyBtn.addEventListener('click', copyToClipboard);
    elements.downloadBtn.addEventListener('click', downloadImage);
    elements.saveLocalBtn.addEventListener('click', saveToLocal);
    elements.closeEditorBtn.addEventListener('click', closeEditor);

    // Canvas events
    elements.editorCanvas.addEventListener('mousedown', handleMouseDown);
    elements.editorCanvas.addEventListener('mousemove', handleMouseMove);
    elements.editorCanvas.addEventListener('mouseup', handleMouseUp);
    elements.editorCanvas.addEventListener('mouseleave', handleMouseUp);
}

// Screenshot Capture
async function captureScreenshot() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { mediaSource: 'screen' }
        });

        const video = document.createElement('video');
        video.srcObject = stream;
        video.play();

        await new Promise(resolve => {
            video.onloadedmetadata = resolve;
        });

        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0);

        stream.getTracks().forEach(track => track.stop());

        const dataUrl = canvas.toDataURL('image/png');
        loadImageIntoEditor(dataUrl);
        showToast('Screenshot captured successfully!', 'success');
    } catch (error) {
        if (error.name !== 'NotAllowedError') {
            showToast('Failed to capture screenshot: ' + error.message, 'error');
        }
    }
}

// Screen Recording
async function toggleRecording() {
    if (state.isRecording) {
        stopRecording();
    } else {
        startRecording();
    }
}

async function startRecording() {
    try {
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: { mediaSource: 'screen' },
            audio: false
        });

        const options = { mimeType: 'video/webm;codecs=vp9' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options.mimeType = 'video/webm';
        }

        state.mediaRecorder = new MediaRecorder(stream, options);
        state.recordedChunks = [];

        state.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                state.recordedChunks.push(event.data);
            }
        };

        state.mediaRecorder.onstop = () => {
            const blob = new Blob(state.recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            saveRecordingToLibrary(url, blob);
            showToast('Recording saved successfully!', 'success');
        };

        stream.getVideoTracks()[0].onended = () => {
            if (state.isRecording) {
                stopRecording();
            }
        };

        state.mediaRecorder.start();
        state.isRecording = true;
        state.recordingStartTime = Date.now();

        elements.recordBtn.classList.add('btn-primary');
        elements.recordBtn.classList.remove('btn-secondary');
        elements.recordBtnText.textContent = 'Stop Recording';
        elements.recordingTimer.classList.remove('hidden');

        startTimer();
    } catch (error) {
        if (error.name !== 'NotAllowedError') {
            showToast('Failed to start recording: ' + error.message, 'error');
        }
    }
}

function stopRecording() {
    if (state.mediaRecorder && state.mediaRecorder.state !== 'inactive') {
        state.mediaRecorder.stop();
        state.mediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    state.isRecording = false;
    elements.recordBtn.classList.remove('btn-primary');
    elements.recordBtn.classList.add('btn-secondary');
    elements.recordBtnText.textContent = 'Start Recording';
    elements.recordingTimer.classList.add('hidden');

    if (state.timerInterval) {
        clearInterval(state.timerInterval);
        state.timerInterval = null;
    }
}

function startTimer() {
    state.timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - state.recordingStartTime) / 1000);
        const minutes = Math.floor(elapsed / 60);
        const seconds = elapsed % 60;
        elements.timerText.textContent = 
            `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    }, 1000);
}

// Image Editor
function loadImageIntoEditor(dataUrl) {
    const img = new Image();
    img.onload = () => {
        state.originalImage = img;
        state.annotations = [];
        state.stepCounter = 1;

        const maxWidth = 1200;
        const maxHeight = 800;
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
            height = (height * maxWidth) / width;
            width = maxWidth;
        }
        if (height > maxHeight) {
            width = (width * maxHeight) / height;
            height = maxHeight;
        }

        elements.editorCanvas.width = width;
        elements.editorCanvas.height = height;

        redrawCanvas();
        elements.editorSection.classList.remove('hidden');
        elements.editorSection.scrollIntoView({ behavior: 'smooth' });
    };
    img.src = dataUrl;
}

function redrawCanvas() {
    const ctx = elements.editorCanvas.getContext('2d');
    ctx.clearRect(0, 0, elements.editorCanvas.width, elements.editorCanvas.height);

    if (state.originalImage) {
        ctx.drawImage(state.originalImage, 0, 0, elements.editorCanvas.width, elements.editorCanvas.height);
    }

    state.annotations.forEach(annotation => {
        drawAnnotation(ctx, annotation);
    });
}

function drawAnnotation(ctx, annotation) {
    ctx.strokeStyle = annotation.color;
    ctx.lineWidth = annotation.width;
    ctx.fillStyle = annotation.color;

    switch (annotation.type) {
        case 'box':
            ctx.strokeRect(annotation.x, annotation.y, annotation.w, annotation.h);
            break;
        case 'arrow':
            drawArrow(ctx, annotation.x, annotation.y, annotation.x + annotation.w, annotation.y + annotation.h);
            break;
        case 'step':
            drawStepIndicator(ctx, annotation.x, annotation.y, annotation.number);
            break;
    }
}

function drawArrow(ctx, x1, y1, x2, y2) {
    const headLength = 20;
    const angle = Math.atan2(y2 - y1, x2 - x1);

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(x2 - headLength * Math.cos(angle - Math.PI / 6), y2 - headLength * Math.sin(angle - Math.PI / 6));
    ctx.lineTo(x2 - headLength * Math.cos(angle + Math.PI / 6), y2 - headLength * Math.sin(angle + Math.PI / 6));
    ctx.closePath();
    ctx.fill();
}

function drawStepIndicator(ctx, x, y, number) {
    const radius = 25;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, 2 * Math.PI);
    ctx.fill();

    ctx.fillStyle = 'white';
    ctx.font = 'bold 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(number, x, y);
}

// Tool Selection
function selectTool(tool) {
    state.currentTool = tool;
    state.isCropping = (tool === 'crop');
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-tool="${tool}"]`).classList.add('active');
    
    if (tool === 'crop') {
        elements.editorCanvas.classList.add('crop-mode');
    } else {
        elements.editorCanvas.classList.remove('crop-mode');
    }
}

// Canvas Drawing Events
function handleMouseDown(e) {
    if (!state.currentTool) return;

    const rect = elements.editorCanvas.getBoundingClientRect();
    state.startX = e.clientX - rect.left;
    state.startY = e.clientY - rect.top;
    state.isDrawing = true;
}

function handleMouseMove(e) {
    if (!state.isDrawing || !state.currentTool) return;

    const rect = elements.editorCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    if (state.currentTool === 'crop') {
        // Draw crop selection overlay
        redrawCanvas();
        const ctx = elements.editorCanvas.getContext('2d');
        
        const w = currentX - state.startX;
        const h = currentY - state.startY;
        
        // Draw darkened overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, elements.editorCanvas.width, elements.editorCanvas.height);
        
        // Clear the selected area
        ctx.clearRect(state.startX, state.startY, w, h);
        
        // Redraw image in selected area
        if (state.originalImage) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(state.startX, state.startY, w, h);
            ctx.clip();
            ctx.drawImage(state.originalImage, 0, 0, elements.editorCanvas.width, elements.editorCanvas.height);
            ctx.restore();
        }
        
        // Draw selection border
        ctx.strokeStyle = '#66d9ef';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.strokeRect(state.startX, state.startY, w, h);
        ctx.setLineDash([]);
        
        return;
    }

    redrawCanvas();

    const ctx = elements.editorCanvas.getContext('2d');
    ctx.strokeStyle = state.currentColor;
    ctx.lineWidth = state.strokeWidth;
    ctx.fillStyle = state.currentColor;

    const w = currentX - state.startX;
    const h = currentY - state.startY;

    switch (state.currentTool) {
        case 'box':
            ctx.strokeRect(state.startX, state.startY, w, h);
            break;
        case 'arrow':
            drawArrow(ctx, state.startX, state.startY, currentX, currentY);
            break;
        case 'step':
            drawStepIndicator(ctx, state.startX, state.startY, state.stepCounter);
            break;
    }
}

function handleMouseUp(e) {
    if (!state.isDrawing || !state.currentTool) return;

    const rect = elements.editorCanvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const w = currentX - state.startX;
    const h = currentY - state.startY;

    if (state.currentTool === 'crop') {
        // Store crop selection and show confirmation
        state.cropSelection = {
            x: Math.min(state.startX, currentX),
            y: Math.min(state.startY, currentY),
            w: Math.abs(w),
            h: Math.abs(h)
        };
        state.isDrawing = false;
        showCropConfirmation();
        return;
    }

    const annotation = {
        type: state.currentTool,
        x: state.startX,
        y: state.startY,
        w: w,
        h: h,
        color: state.currentColor,
        width: state.strokeWidth
    };

    if (state.currentTool === 'step') {
        annotation.number = state.stepCounter;
        state.stepCounter++;
    }

    state.annotations.push(annotation);
    state.isDrawing = false;
    redrawCanvas();
}

// Crop Functions
function showCropConfirmation() {
    const existingDiv = document.querySelector('.crop-actions');
    if (existingDiv) {
        existingDiv.remove();
    }
    
    const cropActionsDiv = document.createElement('div');
    cropActionsDiv.className = 'crop-actions';
    cropActionsDiv.innerHTML = `
        <button id="applyCropBtn" class="btn btn-primary">Apply Crop</button>
        <button id="cancelCropBtn" class="btn btn-outline">Cancel</button>
    `;
    
    const toolbar = document.querySelector('.editor-toolbar');
    toolbar.insertAdjacentElement('afterend', cropActionsDiv);
    
    document.getElementById('applyCropBtn').addEventListener('click', applyCrop);
    document.getElementById('cancelCropBtn').addEventListener('click', cancelCrop);
}

function applyCrop() {
    if (!state.cropSelection) return;
    
    const { x, y, w, h } = state.cropSelection;
    
    // Create a new canvas with cropped dimensions
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = w;
    tempCanvas.height = h;
    const tempCtx = tempCanvas.getContext('2d');
    
    // Draw the cropped portion
    tempCtx.drawImage(
        elements.editorCanvas,
        x, y, w, h,
        0, 0, w, h
    );
    
    // Create new image from cropped canvas
    const croppedImage = new Image();
    croppedImage.onload = () => {
        state.originalImage = croppedImage;
        elements.editorCanvas.width = w;
        elements.editorCanvas.height = h;
        
        // Clear annotations that are outside the crop area
        state.annotations = state.annotations.filter(ann => {
            return ann.x >= x && ann.y >= y && 
                   ann.x + ann.w <= x + w && ann.y + ann.h <= y + h;
        }).map(ann => ({
            ...ann,
            x: ann.x - x,
            y: ann.y - y
        }));
        
        redrawCanvas();
        cancelCrop();
        showToast('Image cropped successfully!', 'success');
    };
    croppedImage.src = tempCanvas.toDataURL();
}

function cancelCrop() {
    state.cropSelection = null;
    state.currentTool = null;
    state.isCropping = false;
    elements.editorCanvas.classList.remove('crop-mode');
    
    const cropActionsDiv = document.querySelector('.crop-actions');
    if (cropActionsDiv) {
        cropActionsDiv.remove();
    }
    
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.classList.remove('active');
    });
    
    redrawCanvas();
}

// Annotation Actions
function undoLastAnnotation() {
    if (state.annotations.length > 0) {
        const lastAnnotation = state.annotations.pop();
        if (lastAnnotation.type === 'step') {
            state.stepCounter--;
        }
        redrawCanvas();
    }
}

function clearAllAnnotations() {
    state.annotations = [];
    state.stepCounter = 1;
    redrawCanvas();
}

// Export Actions
async function copyToClipboard() {
    try {
        const blob = await new Promise(resolve => {
            elements.editorCanvas.toBlob(resolve, 'image/png');
        });

        await navigator.clipboard.write([
            new ClipboardItem({ 'image/png': blob })
        ]);

        showToast('Copied to clipboard!', 'success');
    } catch (error) {
        showToast('Failed to copy to clipboard: ' + error.message, 'error');
    }
}

function downloadImage() {
    const dataUrl = elements.editorCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = `screenshot-${Date.now()}.png`;
    link.href = dataUrl;
    link.click();
    showToast('Downloaded successfully!', 'success');
}

async function saveToLocal() {
    try {
        const dataUrl = elements.editorCanvas.toDataURL('image/png');
        const item = {
            id: Date.now(),
            type: 'screenshot',
            data: dataUrl,
            timestamp: new Date().toISOString()
        };

        const library = getLibrary();
        library.push(item);
        saveLibrary(library);
        loadLibrary();

        showToast('Saved to library!', 'success');
    } catch (error) {
        showToast('Failed to save: ' + error.message, 'error');
    }
}

function closeEditor() {
    elements.editorSection.classList.add('hidden');
    state.currentTool = null;
    state.annotations = [];
    state.stepCounter = 1;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(btn => {
        btn.classList.remove('active');
    });
}

// Local Storage Management
function getLibrary() {
    try {
        const library = localStorage.getItem('sharey-library');
        return library ? JSON.parse(library) : [];
    } catch (error) {
        console.error('Error loading library:', error);
        return [];
    }
}

function saveLibrary(library) {
    try {
        localStorage.setItem('sharey-library', JSON.stringify(library));
    } catch (error) {
        if (error.name === 'QuotaExceededError') {
            showToast('Storage quota exceeded. Please delete some items.', 'error');
        } else {
            showToast('Failed to save to storage: ' + error.message, 'error');
        }
    }
}

function saveRecordingToLibrary(url, blob) {
    const reader = new FileReader();
    reader.onloadend = () => {
        const item = {
            id: Date.now(),
            type: 'recording',
            data: reader.result,
            timestamp: new Date().toISOString()
        };

        const library = getLibrary();
        library.push(item);
        saveLibrary(library);
        loadLibrary();
    };
    reader.readAsDataURL(blob);
}

function loadLibrary() {
    const library = getLibrary();
    elements.libraryGrid.innerHTML = '';

    if (library.length === 0) {
        elements.libraryGrid.innerHTML = '<p style="color: var(--text-muted); text-align: center; grid-column: 1/-1;">No saved items yet. Capture a screenshot or record your screen to get started!</p>';
        return;
    }

    library.reverse().forEach(item => {
        const itemEl = createLibraryItem(item);
        elements.libraryGrid.appendChild(itemEl);
    });
}

function createLibraryItem(item) {
    const div = document.createElement('div');
    div.className = 'library-item';

    const date = new Date(item.timestamp);
    const formattedDate = date.toLocaleDateString() + ' ' + date.toLocaleTimeString();

    if (item.type === 'screenshot') {
        div.innerHTML = `
            <img src="${item.data}" class="library-item-preview" alt="Screenshot">
            <div class="library-item-info">
                <span class="library-item-type">📸 Screenshot</span>
                <span>${formattedDate}</span>
            </div>
            <div class="library-item-actions">
                <button class="btn-view">View</button>
                <button class="btn-delete">Delete</button>
            </div>
        `;

        div.querySelector('.btn-view').addEventListener('click', () => {
            loadImageIntoEditor(item.data);
        });
    } else if (item.type === 'recording') {
        div.innerHTML = `
            <video src="${item.data}" class="library-item-preview" muted></video>
            <div class="library-item-info">
                <span class="library-item-type">🎥 Recording</span>
                <span>${formattedDate}</span>
            </div>
            <div class="library-item-actions">
                <button class="btn-view">Download</button>
                <button class="btn-delete">Delete</button>
            </div>
        `;

        div.querySelector('.btn-view').addEventListener('click', () => {
            const link = document.createElement('a');
            link.download = `recording-${item.id}.webm`;
            link.href = item.data;
            link.click();
        });
    }

    div.querySelector('.btn-delete').addEventListener('click', () => {
        deleteLibraryItem(item.id);
    });

    return div;
}

function deleteLibraryItem(id) {
    const library = getLibrary();
    const filtered = library.filter(item => item.id !== id);
    saveLibrary(filtered);
    loadLibrary();
    showToast('Item deleted', 'success');
}

// Toast Notifications
function showToast(message, type = 'success') {
    elements.toast.textContent = message;
    elements.toast.className = `toast ${type}`;
    elements.toast.classList.remove('hidden');

    setTimeout(() => {
        elements.toast.classList.add('hidden');
    }, 3000);
}
