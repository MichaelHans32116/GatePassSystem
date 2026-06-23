// Document Review modal, print preview, drag, resize, and expand/restore.

var isDragging = false;
var isResizing = false;
var isMaximized = false;
var modalStartX = 0;
var modalStartY = 0;
var modalStartLeft = 0;
var modalStartTop = 0;
var modalStartWidth = 0;
var modalStartHeight = 0;
var modalRestoreLayout = null;
var modalFrameRequest = null;
var pendingModalBox = null;
function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

function scheduleModalBoxUpdate(modal, box) {
            pendingModalBox = { ...(pendingModalBox || {}), ...box };
            if (modalFrameRequest) return;

            modalFrameRequest = requestAnimationFrame(() => {
                if (!pendingModalBox) return;
                if (pendingModalBox.left !== undefined) modal.style.left = pendingModalBox.left + 'px';
                if (pendingModalBox.top !== undefined) modal.style.top = pendingModalBox.top + 'px';
                if (pendingModalBox.width !== undefined) modal.style.width = pendingModalBox.width + 'px';
                if (pendingModalBox.height !== undefined) modal.style.height = pendingModalBox.height + 'px';
                pendingModalBox = null;
                modalFrameRequest = null;
            });
        }

function setModalInteractionState(mode, enabled) {
            const modal = document.getElementById('printModalContent');
            if (!modal) return;

            modal.classList.toggle('is-dragging', enabled && mode === 'drag');
            modal.classList.toggle('is-resizing', enabled && mode === 'resize');
            document.body.classList.toggle('modal-no-select', enabled);
        }

function prepareModalForFloating(modal) {
            const rect = modal.getBoundingClientRect();

            modal.classList.add('is-floating');
            modal.classList.remove('scale-95');
            modal.classList.add('scale-100');

            modal.style.left = rect.left + 'px';
            modal.style.top = rect.top + 'px';
            modal.style.width = rect.width + 'px';
            modal.style.height = rect.height + 'px';
            modal.style.maxWidth = 'none';
            modal.style.maxHeight = 'none';
        }

function resetDocumentModalLayout() {
            const modal = document.getElementById('printModalContent');
            const printModal = document.getElementById('printModal');
            if (!modal || !printModal) return;

            isDragging = false;
            isResizing = false;
            isMaximized = false;
            modalRestoreLayout = null;
            pendingModalBox = null;
            if (modalFrameRequest) {
                cancelAnimationFrame(modalFrameRequest);
                modalFrameRequest = null;
            }
            setModalInteractionState('drag', false);
            setModalInteractionState('resize', false);

            modal.classList.remove('is-floating', 'is-reviewing', 'w-screen', 'h-screen', 'm-0', 'scale-100');
            modal.classList.add('scale-95');

            modal.style.left = '';
            modal.style.top = '';
            modal.style.width = '';
            modal.style.height = '';
            modal.style.maxWidth = '';
            modal.style.maxHeight = '';
            modal.style.borderRadius = '';
            const scrollArea = document.getElementById('modalScrollArea');
            if (scrollArea) scrollArea.scrollTop = 0;

            printModal.classList.remove('p-0');
            printModal.classList.add('p-4');
            updateModalExpandButton(false);
        }

function initializeModalDragResize() {
            const modal = document.getElementById('printModalContent');
            const dragHandle = document.getElementById('modalDragHandle');
            const resizeHandle = document.getElementById('resizeHandle');
            if (!modal || !dragHandle || !resizeHandle) return;

            dragHandle.addEventListener('pointerdown', (e) => {
                if (isMaximized) return;
                if (e.target.closest('button, input, select, textarea, a, label')) return;

                e.preventDefault();
                prepareModalForFloating(modal);

                const rect = modal.getBoundingClientRect();
                isDragging = true;
                modalStartX = e.clientX;
                modalStartY = e.clientY;
                modalStartLeft = rect.left;
                modalStartTop = rect.top;
                modalStartWidth = rect.width;
                modalStartHeight = rect.height;

                dragHandle.setPointerCapture?.(e.pointerId);
                dragHandle.style.cursor = 'grabbing';
                setModalInteractionState('drag', true);
            });

            resizeHandle.addEventListener('pointerdown', (e) => {
                if (isMaximized) return;

                e.preventDefault();
                e.stopPropagation();
                prepareModalForFloating(modal);

                const rect = modal.getBoundingClientRect();
                isResizing = true;
                modalStartX = e.clientX;
                modalStartY = e.clientY;
                modalStartLeft = rect.left;
                modalStartTop = rect.top;
                modalStartWidth = rect.width;
                modalStartHeight = rect.height;

                resizeHandle.setPointerCapture?.(e.pointerId);
                setModalInteractionState('resize', true);
            });

            document.addEventListener('pointermove', (e) => {
                if (isDragging && !isMaximized) {
                    e.preventDefault();
                    const maxLeft = Math.max(0, window.innerWidth - modalStartWidth);
                    const maxTop = Math.max(0, window.innerHeight - modalStartHeight);
                    const nextLeft = clamp(modalStartLeft + (e.clientX - modalStartX), 0, maxLeft);
                    const nextTop = clamp(modalStartTop + (e.clientY - modalStartY), 0, maxTop);

                    scheduleModalBoxUpdate(modal, { left: nextLeft, top: nextTop });
                }

                if (isResizing && !isMaximized) {
                    e.preventDefault();
                    const minWidth = Math.min(460, Math.max(320, window.innerWidth - modalStartLeft - 10));
                    const minHeight = Math.min(420, Math.max(280, window.innerHeight - modalStartTop - 10));
                    const maxWidth = Math.max(minWidth, window.innerWidth - modalStartLeft - 10);
                    const maxHeight = Math.max(minHeight, window.innerHeight - modalStartTop - 10);

                    const nextWidth = clamp(modalStartWidth + (e.clientX - modalStartX), minWidth, maxWidth);
                    const nextHeight = clamp(modalStartHeight + (e.clientY - modalStartY), minHeight, maxHeight);

                    scheduleModalBoxUpdate(modal, { width: nextWidth, height: nextHeight });
                }
            }, { passive: false });

            document.addEventListener('pointerup', () => {
                isDragging = false;
                isResizing = false;
                dragHandle.style.cursor = 'move';
                setModalInteractionState('drag', false);
                setModalInteractionState('resize', false);
            });

            window.addEventListener('resize', () => {
                if (!modal.classList.contains('is-floating') || isMaximized) return;
                const rect = modal.getBoundingClientRect();
                scheduleModalBoxUpdate(modal, {
                    left: clamp(rect.left, 0, Math.max(0, window.innerWidth - rect.width)),
                    top: clamp(rect.top, 0, Math.max(0, window.innerHeight - rect.height)),
                    width: Math.min(rect.width, window.innerWidth),
                    height: Math.min(rect.height, window.innerHeight)
                });
            });

            dragHandle.addEventListener('dblclick', (e) => {
                if (e.target.closest('button, input, select, textarea, a, label')) return;
                toggleMaximizeModal();
            });
        }

function toggleMaximizeModal() {
            const modal = document.getElementById('printModalContent');
            const printModal = document.getElementById('printModal');
            if (!modal || !printModal) return;

            if (isMaximized) {
                isMaximized = false;
                modal.classList.remove('w-screen', 'h-screen', 'm-0');
                printModal.classList.remove('p-0');
                printModal.classList.add('p-4');
                modal.style.borderRadius = '';

                if (modalRestoreLayout) {
                    modal.classList.add('is-floating');
                    modal.style.left = modalRestoreLayout.left;
                    modal.style.top = modalRestoreLayout.top;
                    modal.style.width = modalRestoreLayout.width;
                    modal.style.height = modalRestoreLayout.height;
                }
                updateModalExpandButton(false);
            } else {
                const rect = modal.getBoundingClientRect();
                modalRestoreLayout = {
                    left: modal.style.left || rect.left + 'px',
                    top: modal.style.top || rect.top + 'px',
                    width: modal.style.width || rect.width + 'px',
                    height: modal.style.height || rect.height + 'px'
                };

                isMaximized = true;
                modal.classList.add('is-floating', 'w-screen', 'h-screen', 'm-0');
                modal.style.left = '0px';
                modal.style.top = '0px';
                modal.style.width = '100vw';
                modal.style.height = '100vh';
                modal.style.maxWidth = '100vw';
                modal.style.maxHeight = '100vh';
                modal.style.borderRadius = '0';
                printModal.classList.remove('p-4');
                printModal.classList.add('p-0');
                updateModalExpandButton(true);
            }
        }

function updateModalExpandButton(expanded) {
            const text = document.getElementById('modalExpandText');
            const icon = document.getElementById('modalExpandIcon');
            const button = document.getElementById('modalExpandButton');
            if (text) text.innerText = expanded ? 'Minimize' : 'Expand';
            if (icon) {
                icon.classList.toggle('fa-window-maximize', !expanded);
                icon.classList.toggle('fa-window-minimize', expanded);
            }
            if (button) {
                button.title = expanded
                    ? 'Minimize document workspace'
                    : 'Expand document workspace';
            }
        }

async function viewPass(id, isReviewing = false) {
            let p;
            try {
                p = await getGatePassDetail(id);
            } catch (error) {
                showToast(error instanceof ApiError ? error.message : 'Unable to load document.', 'error');
                return;
            }
            if(!p) return;
            currentViewedPassId = getGatePassViewKey(p);

            const setVal = (elemId, val) => {
                const el = document.getElementById(elemId);
                if (el) el.innerText = val;
            };

            const isMaterial =
                p.formTypeCode === 'MATERIAL_GATE_PASS';
            document.getElementById('printableArea')?.classList.toggle(
                'hidden',
                isMaterial
            );
            document.getElementById('materialPrintableArea')?.classList.toggle(
                'hidden',
                !isMaterial
            );

            setVal('vDateF', p.dateFiled);
            setVal('vControlNo', p.controlNo || p.id);
            setVal('vName', p.userName);
            setVal('vDest', p.destination);
            setVal('vPurp', p.purpose);
            setVal('vExpOut', p.expectedOut);
            setVal('vExpInLabel', p.expectedIn);
            setVal('vReturn', p.willReturn ? 'Yes' : 'No');

            // Format vehicle rendering
            let vehicleString = 'N/A';
            if (p.vehicle) {
                if (p.vehicle.id === 'MANUAL') vehicleString = p.vehicle.name;
                else vehicleString = `${p.vehicle.name} [${p.vehicle.plate}]`;
            }
            setVal('vDriver', p.vehicle ? p.vehicle.driver : 'N/A');
            setVal('vPlate', vehicleString);

            if (isMaterial) {
                const formDate = p.formDate
                    ? new Date(`${String(p.formDate).slice(0, 10)}T00:00:00`).toLocaleDateString()
                    : p.dateFiled;
                setVal('matControlNo', p.controlNo || p.id);
                setVal('matDate', formDate);
                setVal('matAuthorizedName', p.authorizedEmployeeName || 'N/A');
                setVal('matAuthorizedDepartment', p.authorizedDepartmentName || 'N/A');
                setVal('matRemarks', p.materialRemarks || '—');

                const rows = [...(p.materialItems || [])];
                while (rows.length < 8) rows.push(null);
                document.getElementById('matItemsBody').innerHTML = rows
                    .slice(0, 10)
                    .map(item => item
                        ? `<tr><td>${materialEscape(item.itemNo || '')}</td><td>${materialEscape(item.description)}</td><td class="text-center">${materialEscape(Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }))}</td><td class="text-center">${materialEscape(item.unit)}</td></tr>`
                        : '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>')
                    .join('');
            }

            // Signatures handling
            ['sigImm', 'sigPres', 'sigPAS', 'sigMatPrepared', 'sigMatSuperior', 'sigMatPas'].forEach(idPrefix => {
                const sigDiv = document.getElementById(idPrefix);
                const nameSpan = document.getElementById(idPrefix + 'Name');
                if(sigDiv) sigDiv.innerHTML = '';
                if(nameSpan) { nameSpan.innerText = ''; nameSpan.classList.add('hidden'); }
            });

            const handleSig = async (sigData, idPrefix) => {
                if(!sigData) return;
                const nameSpan = document.getElementById(idPrefix + 'Name');
                const sigDiv = document.getElementById(idPrefix);

                if(nameSpan) {
                    nameSpan.innerText = sigData.name;
                    nameSpan.classList.remove('hidden');
                }
                if (sigData.fileId && !sigData.img && isDatabaseSession()) {
                    try {
                        const blob = await ApiClient.blob(`/signatures/${sigData.fileId}`);
                        sigData.img = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.readAsDataURL(blob);
                        });
                    } catch {
                        // Keep the digitally-signed fallback if the file is unavailable.
                    }
                }
                if(sigDiv) {
                    if(sigData.img) {
                        const w = sigData.w || 100;
                        const y = sigData.y || 0;
                        sigDiv.innerHTML = `<img src="${sigData.img}" class="signature-img" style="width: ${w}%; margin-bottom: ${y}px;">`;
                    }
                    else {
                        sigDiv.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 14px; color: blue;">Digitally Signed</span>`;
                    }
                }
            };

            await handleSig(p.signatures.imm, 'sigImm');
            await handleSig(p.signatures.pres, 'sigPres');
            await handleSig(p.signatures.pas, 'sigPAS');
            if (isMaterial) {
                await handleSig(p.signatures.imm, 'sigMatSuperior');
                await handleSig(p.signatures.pas, 'sigMatPas');

                const preparedSignature = p.preparedBySignatureFileId
                    ? {
                        name: p.userName,
                        fileId: p.preparedBySignatureFileId,
                        w: 100,
                        y: 0
                    }
                    : null;
                if (preparedSignature) {
                    await handleSig(preparedSignature, 'sigMatPrepared');
                } else {
                    setVal('sigMatPreparedName', p.userName);
                    document.getElementById('sigMatPreparedName')?.classList.remove('hidden');
                    const preparedContainer = document.getElementById('sigMatPrepared');
                    if (preparedContainer) {
                        preparedContainer.innerHTML =
                            '<span style="font-family:serif;font-style:italic;font-size:11px;color:#155CA2;">Digitally Prepared</span>';
                    }
                }
            }

            const qrContainer = document.getElementById('qrCodeDisplay');
            if(qrContainer) {
                qrContainer.innerHTML = '';
                if (!isMaterial && ['Approved', 'Outside', 'Overdue'].includes(p.status)) {
                    try {
                        const qrValue = await loadQrToken(p);
                        if (qrValue) {
                            new QRCode(qrContainer, {
                                text: qrValue,
                                width: 60,
                                height: 60
                            });
                        }
                    } catch {
                        qrContainer.innerHTML = '<span class="text-[9px] text-gray-400">QR unavailable</span>';
                    }
                }
            }

            // System Admin Progress Tracker
            const wf = document.getElementById('workflowTracker');
            if (currentUser.role === 'System Admin' || ['President','Immediate Superior','PAS Noter','PAS / HR Admin'].includes(currentUser.role)) {
                wf.classList.remove('hidden');
                let stepsHTML = '';

                const hasImm = p.signatures.imm ? 'text-green-600 font-bold' : 'text-gray-400';
                const hasPres = p.signatures.pres ? 'text-green-600 font-bold' : 'text-gray-400';
                const hasPAS = p.signatures.pas ? 'text-green-600 font-bold' : 'text-gray-400';
                const reqPres = !isMaterial && p.requiresPresidentApproval === true;

                const reqSuperior = p.requiresSuperiorApproval !== false;
                let stepNo = 1;

                if (reqSuperior) {
                    stepsHTML += `<span class="${hasImm}"><i class="fas ${p.signatures.imm ? 'fa-check-circle' : 'fa-circle'}"></i> ${stepNo++}. Supervisor</span>`;
                    stepsHTML += ` <i class="fas fa-chevron-right text-gray-300 mx-2"></i> `;
                }

                if (reqPres) {
                    stepsHTML += `<span class="${hasPres}"><i class="fas ${p.signatures.pres ? 'fa-check-circle' : 'fa-circle'}"></i> ${stepNo++}. President</span>`;
                    stepsHTML += ` <i class="fas fa-chevron-right text-gray-300 mx-2"></i> `;
                }
                stepsHTML += `<span class="${hasPAS}"><i class="fas ${p.signatures.pas ? 'fa-check-circle' : 'fa-circle'}"></i> ${stepNo}. ${isMaterial ? 'PAS Approval' : 'PAS'}</span>`;

                document.getElementById('workflowSteps').innerHTML = stepsHTML;
            } else {
                wf.classList.add('hidden');
            }

            resetDocumentModalLayout();

            const modal = document.getElementById('printModal');
            if(modal) {
                modal.classList.remove('hidden');
                modal.classList.add('flex');
                setTimeout(() => {
                    modal.classList.remove('opacity-0');
                    const content = document.getElementById('printModalContent');
                    if(content) {
                        content.classList.remove('scale-95');
                        content.classList.add('scale-100');
                    }
                }, 10);
            }

            // ACTION AREA & DEFAULT SIGNATURE LOADING
            const actionArea = document.getElementById('approvalActionArea');
            if(actionArea) {
                if(isReviewing) {
                    document.getElementById('printModalContent')?.classList.add('is-reviewing');
                    actionArea.style.display = 'flex';
                    resetApprovalSignatureComposer();
                    showSignatureSource('upload');

                    // PRE-FILL USERNAME FOR TRUE LIVE PREVIEW ALIGNMENT
                    let targetContainerId = null;
                    if (p.status === 'Pending Superior') {
                        targetContainerId = isMaterial ? 'sigMatSuperior' : 'sigImm';
                    } else if (p.status === 'Pending President') {
                        targetContainerId = 'sigPres';
                    } else if (p.status === 'Pending PAS') {
                        targetContainerId = isMaterial ? 'sigMatPas' : 'sigPAS';
                    }

                    if (targetContainerId) {
                        const nameSpan = document.getElementById(targetContainerId + 'Name');
                        if (nameSpan) {
                            nameSpan.innerText = currentUser.name;
                            nameSpan.classList.remove('hidden');
                        }
                    }

                    // Load saved default signature if it exists
                    const savedSignature = getSavedApprovalSignature();
                    if (savedSignature) {
                        currentUploadedSig = savedSignature.img;
                        currentOriginalSignatureData = null;

                        // Determine which container to update based on user role
                        let targetContainerId = null;
                        if (currentUser.role === 'President') targetContainerId = 'sigPres';
                        else if (currentUser.canNoteGatePass) targetContainerId = 'sigPAS';
                        else targetContainerId = 'sigImm';

                        renderSignatureImage(
                            currentUploadedSig,
                            savedSignature.w || 100,
                            savedSignature.y || 0
                        );

                        document.getElementById('sigSize').value = savedSignature.w || 100;
                        document.getElementById('sigY').value = savedSignature.y || 0;

                        document.getElementById('sigBgOptions').classList.add('hidden');
                        document.getElementById('sigControls').classList.remove('hidden');
                        document.getElementById('saveDefaultSig').checked = true;
                        setSignatureStatus('Saved default signature loaded. Adjust size or upload/draw a replacement if needed.', 'success');
                    } else {
                        resetApprovalSignatureComposer();
                    }
                } else {
                    document.getElementById('printModalContent')?.classList.remove('is-reviewing');
                    actionArea.style.display = 'none';
                }
            }
        }

function closeModal() {
            const modal = document.getElementById('printModal');
            modal.classList.add('opacity-0');
            document.getElementById('printModalContent').classList.remove('scale-100');
            document.getElementById('printModalContent').classList.add('scale-95');
            setTimeout(() => {
                modal.classList.add('hidden');
                modal.classList.remove('flex');
                currentViewedPassId = null;
                resetDocumentModalLayout();
            }, 300);
        }


window.clamp = clamp;
window.scheduleModalBoxUpdate = scheduleModalBoxUpdate;
window.setModalInteractionState = setModalInteractionState;
window.prepareModalForFloating = prepareModalForFloating;
window.resetDocumentModalLayout = resetDocumentModalLayout;
window.initializeModalDragResize = initializeModalDragResize;
window.toggleMaximizeModal = toggleMaximizeModal;
window.updateModalExpandButton = updateModalExpandButton;
window.viewPass = viewPass;
window.closeModal = closeModal;
