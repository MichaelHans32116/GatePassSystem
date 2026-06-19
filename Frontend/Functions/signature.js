// Signature upload, draw, optional background removal, and placement.

var signaturePadState = { drawing: false, lastX: 0, lastY: 0 };
function removeSignatureBackground(img, options = {}) {
            let mode = options.mode || 'autoSmart';
            const threshold = Number(options.threshold || 20);
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });

            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const width = canvas.width;
            const height = canvas.height;

            let bg = sampleCornerBackground(data, width, height);
            if (mode === 'white') bg = { r: 255, g: 255, b: 255 };
            if (mode === 'blue') {
                // Use the sampled corner if it is blue-ish; otherwise use a standard ID-photo blue.
                const sampledHue = rgbToHue(bg.r, bg.g, bg.b);
                const sampledSat = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
                if (!(sampledHue >= 185 && sampledHue <= 250 && sampledSat > 25)) {
                    bg = { r: 8, g: 59, b: 115 };
                }
            }
            if (mode === 'autoSmart') {
                const max = Math.max(bg.r, bg.g, bg.b);
                const min = Math.min(bg.r, bg.g, bg.b);
                const saturation = max - min;
                const brightness = (bg.r + bg.g + bg.b) / 3;
                const hue = rgbToHue(bg.r, bg.g, bg.b);
                if (brightness > 210 && saturation < 45) {
                    mode = 'white';
                    bg = { r: 255, g: 255, b: 255 };
                } else if (hue >= 180 && hue <= 255 && saturation > 25) {
                    mode = 'blue';
                } else {
                    mode = 'auto';
                }
            }

            const softEdge = Math.max(12, threshold * 0.45);

            for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                const a = data[i + 3];

                const max = Math.max(r, g, b);
                const min = Math.min(r, g, b);
                const saturation = max - min;
                const brightness = (r + g + b) / 3;
                const hue = rgbToHue(r, g, b);
                const distance = colorDistance({ r, g, b }, bg);

                let removeScore = 0;

                if (mode === 'white') {
                    const whiteDistance = colorDistance({ r, g, b }, { r: 255, g: 255, b: 255 });
                    if (brightness > 245 && saturation < 22) removeScore = 1;
                    else if (brightness > 205 && saturation < 45) removeScore = Math.max(removeScore, 1 - (whiteDistance / (threshold + softEdge)));
                } else if (mode === 'blue') {
                    const isBlueHue = hue >= 180 && hue <= 255;
                    const isMostlyBlue = b >= r + 18 || (b >= g - 8 && b > r + 8);
                    if (distance <= threshold && isBlueHue && saturation > 25) removeScore = 1;
                    else if (distance <= threshold + softEdge && isMostlyBlue && saturation > 18) {
                        removeScore = Math.max(removeScore, 1 - ((distance - threshold) / softEdge));
                    }
                } else {
                    // Auto mode: remove pixels similar to the image-corner background.
                    if (distance <= threshold) removeScore = 1;
                    else if (distance <= threshold + softEdge) removeScore = Math.max(removeScore, 1 - ((distance - threshold) / softEdge));

                    // Also catch plain white paper if the uploaded item is a scanned signature.
                    if (brightness > 245 && saturation < 20) removeScore = 1;
                }

                removeScore = Math.max(0, Math.min(1, removeScore));
                if (removeScore >= 0.98) {
                    data[i + 3] = 0;
                } else if (removeScore > 0) {
                    data[i + 3] = Math.round(a * (1 - removeScore));
                }
            }

            // Clean small blue/white halo around the subject/signature.
            featherAlphaEdges(data, width, height);

            ctx.putImageData(imageData, 0, 0);
            return canvas.toDataURL('image/png');
        }

function colorDistance(c1, c2) {
            return Math.sqrt(
                Math.pow(c1.r - c2.r, 2) +
                Math.pow(c1.g - c2.g, 2) +
                Math.pow(c1.b - c2.b, 2)
            );
        }

function rgbToHue(r, g, b) {
            r /= 255; g /= 255; b /= 255;
            const max = Math.max(r, g, b);
            const min = Math.min(r, g, b);
            const d = max - min;
            if (d === 0) return 0;
            let h;
            if (max === r) h = ((g - b) / d) % 6;
            else if (max === g) h = (b - r) / d + 2;
            else h = (r - g) / d + 4;
            h *= 60;
            if (h < 0) h += 360;
            return h;
        }

function sampleCornerBackground(data, width, height) {
            const sampleSize = Math.max(8, Math.floor(Math.min(width, height) * 0.06));
            const points = [];

            const collect = (xStart, yStart) => {
                for (let y = yStart; y < yStart + sampleSize; y++) {
                    for (let x = xStart; x < xStart + sampleSize; x++) {
                        const clampedX = Math.max(0, Math.min(width - 1, x));
                        const clampedY = Math.max(0, Math.min(height - 1, y));
                        const idx = (clampedY * width + clampedX) * 4;
                        points.push([data[idx], data[idx + 1], data[idx + 2]]);
                    }
                }
            };

            collect(0, 0);
            collect(width - sampleSize, 0);
            collect(0, height - sampleSize);
            collect(width - sampleSize, height - sampleSize);

            // Median is more stable than average if a shoulder/hair accidentally touches a corner.
            const median = (arr) => {
                const sorted = arr.slice().sort((a, b) => a - b);
                return sorted[Math.floor(sorted.length / 2)];
            };

            return {
                r: median(points.map(p => p[0])),
                g: median(points.map(p => p[1])),
                b: median(points.map(p => p[2]))
            };
        }

function featherAlphaEdges(data, width, height) {
            const alpha = new Uint8ClampedArray(width * height);
            for (let i = 0, p = 0; i < data.length; i += 4, p++) alpha[p] = data[i + 3];

            for (let y = 1; y < height - 1; y++) {
                for (let x = 1; x < width - 1; x++) {
                    const p = y * width + x;
                    if (alpha[p] === 0 || alpha[p] === 255) continue;

                    const neighbors = [
                        alpha[p - 1], alpha[p + 1],
                        alpha[p - width], alpha[p + width]
                    ];
                    const avg = neighbors.reduce((a, b) => a + b, 0) / neighbors.length;
                    data[p * 4 + 3] = Math.round((alpha[p] + avg) / 2);
                }
            }
        }

function getSignatureTargetContainerId() {
            const pass = gatePasses.find(item => item.id === currentViewedPassId);
            if (pass?.status === 'Pending Superior') return 'sigImm';
            if (pass?.status === 'Pending President') return 'sigPres';
            if (pass?.status === 'Pending PAS') return 'sigPAS';
            if (!currentUser) return 'sigImm';
            if (currentUser.role === 'President') return 'sigPres';
            if (currentUser.canNoteGatePass) return 'sigPAS';
            return 'sigImm';
        }

function renderSignatureImage(dataUrl, width = 100, y = 0) {
            const targetDiv = document.getElementById(getSignatureTargetContainerId());
            if (targetDiv) {
                targetDiv.innerHTML = `<img src="${dataUrl}" id="liveDocumentSig" class="signature-img" style="width: ${width}%; margin-bottom: ${y}px;">`;
            }
            const preview = document.getElementById('signatureEditorPreview');
            if (preview) {
                preview.innerHTML = `<img src="${dataUrl}" id="liveEditorSig" style="width: ${Math.min(Number(width), 180)}%; transform: translateY(${-Number(y)}px);">`;
            }
        }

function setSignatureStatus(message, type = 'muted') {
            const status = document.getElementById('sigStatus');
            if (!status) return;

            status.className = 'text-[10px] leading-relaxed';
            if (type === 'success') status.classList.add('text-green-700', 'font-semibold');
            else if (type === 'error') status.classList.add('text-red-600', 'font-semibold');
            else if (type === 'info') status.classList.add('text-mpiBlue', 'font-semibold');
            else status.classList.add('text-gray-500');

            status.innerText = message;
        }

function setSignatureBusy(isBusy) {
            const bgMode = document.getElementById('sigBgMode');
            const bgThreshold = document.getElementById('sigBgThreshold');
            const upload = document.getElementById('sigUpload');
            if (bgMode) bgMode.disabled = isBusy;
            if (bgThreshold) bgThreshold.disabled = isBusy;
            if (upload) upload.disabled = isBusy;
        }

function detectSimpleBackgroundMode(img) {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            canvas.width = img.naturalWidth || img.width;
            canvas.height = img.naturalHeight || img.height;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const bg = sampleCornerBackground(imageData.data, canvas.width, canvas.height);
            const max = Math.max(bg.r, bg.g, bg.b);
            const min = Math.min(bg.r, bg.g, bg.b);
            const saturation = max - min;
            const brightness = (bg.r + bg.g + bg.b) / 3;
            const hue = rgbToHue(bg.r, bg.g, bg.b);
            if (brightness > 210 && saturation < 45) return 'white';
            if (hue >= 180 && hue <= 255 && saturation > 25) return 'blue';
            return 'auto';
        }

function dataUrlToBlob(dataUrl) {
            const parts = dataUrl.split(',');
            const mime = (parts[0].match(/:(.*?);/) || [])[1] || 'image/png';
            const binary = atob(parts[1]);
            const bytes = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
            return new Blob([bytes], { type: mime });
        }

async function removeBackgroundWithPython(dataUrl) {
            const formData = new FormData();
            formData.append('file', dataUrlToBlob(dataUrl), 'signature.png');
            const blob = await ApiClient.blob('/signatures/process-background', {
                method: 'POST',
                body: formData
            });
            return await new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.readAsDataURL(blob);
            });
        }

function loadImageFromDataUrl(dataUrl) {
            return new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = reject;
                img.src = dataUrl;
            });
        }

async function processAndRenderSignature(showMessage = true) {
            if (!currentOriginalSignatureData) return;

            let mode = document.getElementById('sigBgMode')?.value || 'none';
            const threshold = parseInt(document.getElementById('sigBgThreshold')?.value || '20', 10);

            const currentWidth = document.getElementById('sigSize')?.value || 100;
            const currentY = document.getElementById('sigY')?.value || 0;

            try {
                setSignatureBusy(true);
                setSignatureStatus(mode === 'aiServer' ? 'Processing with local Python remover...' : 'Processing signature preview...', 'info');

                if (mode === 'none') {
                    currentUploadedSig = currentOriginalSignatureData;
                } else if (mode === 'aiServer' || (mode === 'autoSmart' && isDatabaseSession())) {
                    showToast('Testing white, blue, and AI removal automatically...', 'info');
                    currentUploadedSig = await removeBackgroundWithPython(currentOriginalSignatureData);
                } else {
                    const img = await loadImageFromDataUrl(currentOriginalSignatureData);
                    let effectiveMode = mode;
                    if (mode === 'autoSmart') {
                        effectiveMode = detectSimpleBackgroundMode(img);
                    }
                    currentUploadedSig = removeSignatureBackground(img, { mode: effectiveMode, threshold });
                }

                renderSignatureImage(currentUploadedSig, currentWidth, currentY);
                document.getElementById('sigBgOptions')?.classList.remove('hidden');
                document.getElementById('sigControls')?.classList.remove('hidden');
                document.getElementById('saveDefaultSig').checked = true;

                const statusMessage = mode === 'none'
                    ? 'Signature image attached. Background removal is off.'
                    : mode === 'aiServer' || (mode === 'autoSmart' && isDatabaseSession())
                        ? 'Automatic best-result background removal applied.'
                        : `Background removal preview applied: ${mode}, strength ${threshold}.`;
                setSignatureStatus(statusMessage, 'success');

                if (showMessage) {
                    const message = mode === 'none'
                        ? 'Image attached without background removal.'
                        : mode === 'aiServer' || (mode === 'autoSmart' && isDatabaseSession())
                            ? 'Best result selected from white, blue, and AI removal.'
                            : `Background removal applied: ${mode} at strength ${threshold}.`;
                    showToast(message, 'success');
                }
            } catch (error) {
                console.error(error);
                const img = await loadImageFromDataUrl(currentOriginalSignatureData);
                currentUploadedSig = removeSignatureBackground(img, { mode: 'autoSmart', threshold });
                renderSignatureImage(currentUploadedSig, currentWidth, currentY);
                document.getElementById('sigBgOptions')?.classList.remove('hidden');
                document.getElementById('sigControls')?.classList.remove('hidden');
                setSignatureStatus('Python remover unavailable. Local auto remover was used instead.', 'error');
                showToast('AI server unavailable. Used local auto remover instead.', 'error');
            } finally {
                setSignatureBusy(false);
            }
        }

function showSignatureSource(source) {
            const uploadPanel = document.getElementById('sigUploadPanel');
            const drawPanel = document.getElementById('sigDrawPanel');
            const uploadBtn = document.getElementById('btnSigUploadPanel');
            const drawBtn = document.getElementById('btnSigDrawPanel');

            if (source === 'draw') {
                uploadPanel?.classList.add('hidden');
                drawPanel?.classList.remove('hidden');
                drawBtn?.classList.add('bg-mpiBlue', 'text-white');
                drawBtn?.classList.remove('bg-white', 'text-mpiBlue', 'border');
                uploadBtn?.classList.remove('bg-mpiBlue', 'text-white');
                uploadBtn?.classList.add('bg-white', 'text-mpiBlue', 'border', 'border-blue-200');
                requestAnimationFrame(resizeSignatureCanvas);
                setSignatureStatus('Draw your signature, then click Use Drawn Signature.', 'info');
            } else {
                drawPanel?.classList.add('hidden');
                uploadPanel?.classList.remove('hidden');
                uploadBtn?.classList.add('bg-mpiBlue', 'text-white');
                uploadBtn?.classList.remove('bg-white', 'text-mpiBlue', 'border');
                drawBtn?.classList.remove('bg-mpiBlue', 'text-white');
                drawBtn?.classList.add('bg-white', 'text-mpiBlue', 'border', 'border-blue-200');
                if (!currentOriginalSignatureData && !currentUploadedSig) {
                    setSignatureStatus('Upload a PNG/JPG signature, or switch to Draw Signature.', 'muted');
                }
            }
        }

function setupSignaturePad() {
            const canvas = document.getElementById('signaturePad');
            if (!canvas) return;
            resizeSignatureCanvas();

            const getPoint = (event) => {
                const rect = canvas.getBoundingClientRect();
                return {
                    x: event.clientX - rect.left,
                    y: event.clientY - rect.top
                };
            };

            const start = (event) => {
                event.preventDefault();
                signaturePadState.drawing = true;
                const p = getPoint(event);
                signaturePadState.lastX = p.x;
                signaturePadState.lastY = p.y;
            };

            const move = (event) => {
                if (!signaturePadState.drawing) return;
                event.preventDefault();
                const ctx = canvas.getContext('2d');
                const p = getPoint(event);
                ctx.lineWidth = 4;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                ctx.strokeStyle = '#020617';
                ctx.beginPath();
                ctx.moveTo(signaturePadState.lastX, signaturePadState.lastY);
                ctx.lineTo(p.x, p.y);
                ctx.stroke();
                signaturePadState.lastX = p.x;
                signaturePadState.lastY = p.y;
            };

            const end = () => {
                signaturePadState.drawing = false;
            };

            canvas.addEventListener('pointerdown', start);
            canvas.addEventListener('pointermove', move);
            canvas.addEventListener('pointerup', end);
            canvas.addEventListener('pointerleave', end);
            window.addEventListener('resize', resizeSignatureCanvas);
        }

function resizeSignatureCanvas() {
            const canvas = document.getElementById('signaturePad');
            if (!canvas) return;
            const existing = canvas.toDataURL('image/png');
            const rect = canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio || 1;
            if (rect.width <= 0) return;
            canvas.width = Math.floor(rect.width * dpr);
            canvas.height = Math.floor(170 * dpr);
            canvas.style.height = '170px';
            const ctx = canvas.getContext('2d');
            ctx.scale(dpr, dpr);
            if (existing && existing.length > 1000) {
                const img = new Image();
                img.onload = () => ctx.drawImage(img, 0, 0, rect.width, 170);
                img.src = existing;
            }
        }

function isSignatureCanvasBlank(canvas) {
            const ctx = canvas.getContext('2d');
            const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
            for (let i = 3; i < data.length; i += 4) {
                if (data[i] !== 0) return false;
            }
            return true;
        }

function clearSignaturePad() {
            const canvas = document.getElementById('signaturePad');
            if (!canvas) return;
            const ctx = canvas.getContext('2d');
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            setSignatureStatus('Signature pad cleared.', 'muted');
        }

function useDrawnSignature() {
            const canvas = document.getElementById('signaturePad');
            if (!canvas) return;
            if (isSignatureCanvasBlank(canvas)) {
                setSignatureStatus('Draw a signature before using it.', 'error');
                showToast('Please draw a signature first.', 'error');
                return;
            }
            currentOriginalSignatureData = null;
            currentUploadedSig = canvas.toDataURL('image/png');
            document.getElementById('sigSize').value = 100;
            document.getElementById('sigY').value = 0;
            renderSignatureImage(currentUploadedSig, 100, 0);
            document.getElementById('sigBgOptions')?.classList.add('hidden');
            document.getElementById('sigControls')?.classList.remove('hidden');
            document.getElementById('saveDefaultSig').checked = true;
            setSignatureStatus('Drawn signature added. Adjust size or vertical offset if needed.', 'success');
            showToast('Drawn signature added to document.', 'success');
        }

function initializeSignatureControls() {
    const upload = document.getElementById('sigUpload');
    const mode = document.getElementById('sigBgMode');
    const threshold = document.getElementById('sigBgThreshold');
    const size = document.getElementById('sigSize');
    const offset = document.getElementById('sigY');

    upload?.addEventListener('change', function() {
        if (!this.files || !this.files[0]) return;

        const selectedFile = this.files[0];
        const reader = new FileReader();
        reader.onload = function(event) {
            currentOriginalSignatureData = event.target.result;
            size.value = 100;
            offset.value = 0;
            mode.value = 'none';
            threshold.value = 20;
            document.getElementById('sigBgThresholdValue').innerText = '20';
            document.getElementById('sigBgOptions')?.classList.remove('hidden');
            document.getElementById('sigFileName').innerText = selectedFile.name;
            processAndRenderSignature();
        };
        reader.readAsDataURL(selectedFile);
    });

    mode?.addEventListener('change', function() {
        processAndRenderSignature();
    });

    threshold?.addEventListener('input', function() {
        document.getElementById('sigBgThresholdValue').innerText = this.value;
        if (mode?.value !== 'none') processAndRenderSignature(false);
    });

    const applySignaturePlacement = () => {
        const liveSignature = document.getElementById('liveDocumentSig');
        if (liveSignature) {
            liveSignature.style.width = size.value + '%';
            liveSignature.style.marginBottom = offset.value + 'px';
        }
        const editorSignature = document.getElementById('liveEditorSig');
        if (editorSignature) {
            editorSignature.style.width = Math.min(Number(size.value), 180) + '%';
            editorSignature.style.transform = `translateY(${-Number(offset.value)}px)`;
        }
    };

    size?.addEventListener('input', applySignaturePlacement);
    offset?.addEventListener('input', applySignaturePlacement);
}

window.removeSignatureBackground = removeSignatureBackground;
window.showSignatureSource = showSignatureSource;
window.clearSignaturePad = clearSignaturePad;
window.useDrawnSignature = useDrawnSignature;
window.processAndRenderSignature = processAndRenderSignature;
window.initializeSignatureControls = initializeSignatureControls;
window.setupSignaturePad = setupSignaturePad;
window.resizeSignatureCanvas = resizeSignatureCanvas;
window.setSignatureStatus = setSignatureStatus;
