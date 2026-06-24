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

            const multiPrint = document.getElementById('multiPrintableArea');
            if (multiPrint) {
                multiPrint.innerHTML = '';
                multiPrint.classList.add('hidden');
            }
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

function materialSignatureSlot(idPrefix, pageIndex) {
            const isPrimary = pageIndex === 0;
            return {
                imageAttribute: isPrimary
                    ? `id="${idPrefix}"`
                    : `data-material-signature-copy="${idPrefix}"`,
                nameAttribute: isPrimary
                    ? `id="${idPrefix}Name"`
                    : `data-material-signature-name-copy="${idPrefix}"`
            };
        }

function renderMaterialBundle(pass) {
            const container = document.getElementById('materialPrintableArea');
            if (!container) return;

            const itemRows = [...(pass.materialItems || [])];
            const pageCount = Math.max(1, Math.ceil(itemRows.length / 9));
            const formDate = pass.formDate
                ? new Date(`${String(pass.formDate).slice(0, 10)}T00:00:00`)
                    .toLocaleDateString()
                : pass.dateFiled;
            const controlNo = String(pass.controlNo || pass.id || '')
                .trim()
                .slice(0, 20);

            container.innerHTML = Array.from({ length: pageCount }, (_, pageIndex) => {
                const pageItems = itemRows.slice(pageIndex * 9, pageIndex * 9 + 9);
                while (pageItems.length < 9) pageItems.push(null);

                const prepared = materialSignatureSlot('sigMatPrepared', pageIndex);
                const superior = materialSignatureSlot('sigMatSuperior', pageIndex);
                const pas = materialSignatureSlot('sigMatPas', pageIndex);
                const rowsHtml = pageItems.map(item => item
                    ? `<tr>
                        <td>${materialEscape(item.itemNo || '')}</td>
                        <td>${materialEscape(item.description)}</td>
                        <td class="text-center">${materialEscape(Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }))}</td>
                        <td class="text-center">${materialEscape(item.unit)}</td>
                    </tr>`
                    : '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>')
                    .join('');

                return `
                    <section class="material-print-page" data-material-page="${pageIndex + 1}">
                        <div class="material-form-header">
                            <div class="material-document-qr" data-material-document-qr></div>
                            <div class="material-form-brand">
                                <img src="Frontend/Design/images/logo.png" alt="MPI Logo">
                                <div>
                                    <h1>MORIROKU PHILIPPINES, INC.</h1>
                                    <p>115 North Science Avenue, Laguna Technopark 4024, Biñan, Laguna Philippines</p>
                                </div>
                            </div>
                            <div class="material-header-control">
                                <span>CONTROL NO.</span>
                                <strong>${materialEscape(controlNo)}</strong>
                            </div>
                        </div>
                        <h2 class="material-form-title">MATERIAL GATE PASS</h2>
                        <div class="material-form-meta">
                            <div><strong>TO</strong><span>GUARD ON DUTY</span></div>
                            <div><strong>DATE</strong><span>${materialEscape(formDate)}</span></div>
                            <div><strong>FROM</strong><span>PERSONNEL &amp; ADMIN. SECTION</span></div>
                            <div><strong>PAGE</strong><span>${pageIndex + 1} OF ${pageCount}</span></div>
                        </div>
                        <div class="material-form-authorization">
                            <p>This is to allow Mr. / Ms. <strong>${materialEscape(pass.authorizedEmployeeName || 'N/A')}</strong></p>
                            <p>of <strong>${materialEscape(pass.authorizedDepartmentName || pass.userDept || 'N/A')}</strong> to bring out the following items.</p>
                        </div>
                        <table class="material-items-table">
                            <thead><tr><th>ITEM NO.</th><th>DESCRIPTION</th><th>QUANTITY</th><th>UNIT</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                        <div class="material-form-remarks"><strong>REMARKS:</strong><span>${materialEscape(pass.materialRemarks || '—')}</span></div>
                        <div class="material-form-signatures">
                            <div>
                                <strong>Prepared By:</strong>
                                <div ${prepared.imageAttribute} class="material-signature-image"></div>
                                <span ${prepared.nameAttribute} class="hidden"></span>
                            </div>
                            <div>
                                <strong>Noted By:</strong>
                                <div ${superior.imageAttribute} class="material-signature-image"></div>
                                <span ${superior.nameAttribute} class="hidden"></span>
                                <small>Immediate Superior</small>
                            </div>
                            <div>
                                <strong>Approved By:</strong>
                                <div ${pas.imageAttribute} class="material-signature-image"></div>
                                <span ${pas.nameAttribute} class="hidden"></span>
                                <small>Personnel &amp; Admin Section</small>
                            </div>
                        </div>
                        <div class="material-page-number">Page ${pageIndex + 1} of ${pageCount}</div>
                    </section>`;
            }).join('') + `
                <div class="qr-back-page" style="page-break-before: always; height: 100vh; display: flex; align-items: center; justify-content: center; flex-direction: column;">
                    <h3 class="text-2xl font-bold mb-4">Gate Pass QR Code</h3>
                    <div id="materialQrCodeBackDisplay" class="flex items-center justify-center p-4 bg-white border-4 border-black rounded-lg"></div>
                    <p class="mt-4 text-gray-500 font-mono">${materialEscape(controlNo)}</p>
                </div>`;

            const qrText = `FRS|MATERIAL_GATE_PASS|${pass.dbId || pass.id}|${controlNo}`;
            container.querySelectorAll('[data-material-document-qr]').forEach(qrContainer => {
                if (typeof QRCode === 'function') {
                    new QRCode(qrContainer, {
                        text: qrText,
                        width: 54,
                        height: 54
                    });
                } else {
                    qrContainer.innerHTML = '<span>QR</span>';
                }
            });

            const qrBackContainer = container.querySelector('#materialQrCodeBackDisplay');
            if (qrBackContainer) {
                if (['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(pass.status)) {
                    if (typeof QRCode === 'function') {
                        new QRCode(qrBackContainer, {
                            text: qrText,
                            width: 200,
                            height: 200
                        });
                    }
                } else {
                    qrBackContainer.innerHTML = '<span class="text-gray-400">QR unavailable (Not Approved)</span>';
                }
            }
        }

function syncMaterialSignatureCopies(idPrefix) {
            const sourceImage = document.getElementById(idPrefix);
            const sourceName = document.getElementById(idPrefix + 'Name');
            document.querySelectorAll(
                `[data-material-signature-copy="${idPrefix}"]`
            ).forEach(target => {
                target.innerHTML = sourceImage?.innerHTML || '';
            });
            document.querySelectorAll(
                `[data-material-signature-name-copy="${idPrefix}"]`
            ).forEach(target => {
                target.innerText = sourceName?.innerText || '';
                target.classList.toggle(
                    'hidden',
                    sourceName?.classList.contains('hidden') !== false
                );
            });
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
            const printableArea = document.getElementById('printableArea');
            document.getElementById('printableArea')?.classList.toggle(
                'hidden',
                isMaterial
            );
            document.getElementById('materialPrintableArea')?.classList.toggle(
                'hidden',
                !isMaterial
            );
            printableArea?.classList.toggle('person-print-form', !isMaterial);

            const compactPersonDateFiled = (value) => {
                if (!value) return 'N/A';
                const textValue = String(value).trim();
                const textualDateMatch = textValue.match(/^([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/);
                if (textualDateMatch) return textualDateMatch[1];
                const parsed = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
                if (Number.isNaN(parsed.getTime())) {
                    const isoDateMatch = textValue.match(/^(\d{4}-\d{2}-\d{2})/);
                    return isoDateMatch ? isoDateMatch[1] : textValue;
                }
                return parsed.toLocaleDateString([], {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                });
            };

            const printableControlNo = (value) => {
                const raw = String(value || '').trim();
                if (!raw) return '';
                if (/^(GP-ID|TEMP|TMP|ID)-/i.test(raw)) return '';
                return raw.length > 20 ? raw.slice(0, 20) : raw;
            };

            setVal('vDateF', isMaterial ? p.dateFiled : compactPersonDateFiled(p.dateFiled));
            setVal('vControlNo', printableControlNo(p.controlNo));
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
                renderMaterialBundle(p);
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
                if (idPrefix.startsWith('sigMat')) {
                    syncMaterialSignatureCopies(idPrefix);
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
                    syncMaterialSignatureCopies('sigMatPrepared');
                }
            }

            const qrContainer = document.getElementById('qrCodeDisplay');
            if(qrContainer) {
                qrContainer.innerHTML = '';
                if (!isMaterial && ['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status)) {
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
            const approvalSignatureEditor = document.getElementById('approvalSignatureEditor');
            const btnApprove = document.getElementById('approveRequestButton');
            const btnReject = document.querySelector('button[onclick="rejectCurrentPass()"]');

            if(actionArea) {
                const btnPrintForm = document.getElementById('btnPrintForm');
                if(btnPrintForm) {
                    if(currentUser.role === 'Security') btnPrintForm.classList.add('hidden');
                    else btnPrintForm.classList.remove('hidden');
                }

                const vActOut = document.getElementById('vActOut');
                const vActIn = document.getElementById('vActIn');
                const vGuardRemarks = document.getElementById('vGuardRemarks');
                const guardStatusRow = document.getElementById('guardStatusRow');
                
                if (vActOut && vActIn && vGuardRemarks && guardStatusRow) {
                    if (p.actualOut || p.actualIn || p.status === 'Outside' || p.status === 'Returned' || p.status === 'Overdue' || p.status === 'Closed') {
                        guardStatusRow.classList.remove('hidden');
                        vActOut.innerText = p.actualOut ? new Date(p.actualOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        vActIn.innerText = p.actualIn ? new Date(p.actualIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                        vGuardRemarks.innerText = (p.status === 'Outside' || p.status === 'Returned' || p.status === 'Closed') ? 'APPROVED' : 'PENDING';
                        if (vGuardRemarks.innerText === 'APPROVED') {
                            vGuardRemarks.classList.remove('bg-gray-200', 'text-gray-600');
                            vGuardRemarks.classList.add('bg-green-100', 'text-green-800');
                        } else {
                            vGuardRemarks.classList.add('bg-gray-200', 'text-gray-600');
                            vGuardRemarks.classList.remove('bg-green-100', 'text-green-800');
                        }
                    } else {
                        guardStatusRow.classList.add('hidden');
                    }
                }

                if(isReviewing) {
                    document.getElementById('printModalContent')?.classList.add('is-reviewing');
                    actionArea.style.display = 'flex';
                    
                    if (currentUser.role === 'Security') {
                        approvalSignatureEditor?.classList.add('hidden');
                        if (btnApprove) {
                            if (p.status === 'Approved' || p.status === 'Overdue') {
                                btnApprove.innerHTML = '<i class="fas fa-sign-out-alt mr-1"></i> Confirm Time Out';
                                btnApprove.onclick = () => { window.executeSecurityScan(p.id); forceCloseModal(); };
                            } else if (p.status === 'Outside') {
                                btnApprove.innerHTML = '<i class="fas fa-sign-in-alt mr-1"></i> Confirm Time In';
                                btnApprove.onclick = () => { window.executeSecurityScan(p.id); forceCloseModal(); };
                            }
                        }
                        if (btnReject) btnReject.classList.add('hidden');
                    } else {
                        approvalSignatureEditor?.classList.remove('hidden');
                        if (btnApprove) {
                            btnApprove.innerHTML = '<i class="fas fa-check-circle mr-1"></i> Approve Request';
                            btnApprove.onclick = approveCurrentPass;
                        }
                        if (btnReject) btnReject.classList.remove('hidden');
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
                        if (targetContainerId.startsWith('sigMat')) {
                            syncMaterialSignatureCopies(targetContainerId);
                        }
                    }

                    const savedSignature = getSavedApprovalSignature(
                        currentUser,
                        p.formTypeCode
                    );
                    if (savedSignature) {
                        currentUploadedSig = savedSignature.img;
                        currentOriginalSignatureData = null;

                        renderSignatureImage(
                            currentUploadedSig,
                            clampSignatureWidth(savedSignature.w),
                            clampSignatureYOffset(savedSignature.y)
                        );

                        document.getElementById('sigSize').value = clampSignatureWidth(savedSignature.w);
                        document.getElementById('sigY').value = clampSignatureYOffset(savedSignature.y);

                        document.getElementById('sigBgOptions').classList.add('hidden');
                        document.getElementById('sigControls').classList.remove('hidden');
                        document.getElementById('saveDefaultSig').checked = true;
                        setSignatureStatus('Saved default signature loaded. Adjust size or upload/draw a replacement if needed.', 'success');
                    }
                    }
                } else {
                    document.getElementById('printModalContent')?.classList.remove('is-reviewing');
                    actionArea.style.display = 'none';
                    approvalSignatureEditor?.classList.add('hidden');
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
                resetApprovalSignatureComposer?.();
                resetDocumentModalLayout();
            }, 300);
        }

function forceCloseModal() {
            const modal = document.getElementById('printModal');
            const content = document.getElementById('printModalContent');
            if (!modal || !content) return;
            modal.classList.add('hidden');
            modal.classList.remove('flex', 'opacity-0');
            content.classList.remove('scale-100');
            content.classList.add('scale-95');
            currentViewedPassId = null;
            resetApprovalSignatureComposer?.();
            resetDocumentModalLayout();
        }

async function renderPersonGatePassClone(p) {
    const clone = document.getElementById('printableArea').cloneNode(true);
    clone.id = '';
    clone.classList.remove('hidden');
    clone.classList.add('multi-print-item');
    
    const setVal = (selector, val) => {
        const el = clone.querySelector(selector);
        if (el) el.innerText = val;
    };
    
    const compactPersonDateFiled = (value) => {
        if (!value) return 'N/A';
        const textValue = String(value).trim();
        const textualDateMatch = textValue.match(/^([A-Za-z]{3}\s+\d{1,2},\s+\d{4})/);
        if (textualDateMatch) return textualDateMatch[1];
        const parsed = new Date(value.endsWith?.('Z') ? value : `${value}Z`);
        if (Number.isNaN(parsed.getTime())) {
            const isoDateMatch = textValue.match(/^(\d{4}-\d{2}-\d{2})/);
            return isoDateMatch ? isoDateMatch[1] : textValue;
        }
        return parsed.toLocaleDateString([], {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    };

    const printableControlNo = (value) => {
        const raw = String(value || '').trim();
        if (!raw) return '';
        if (/^(GP-ID|TEMP|TMP|ID)-/i.test(raw)) return '';
        return raw.length > 20 ? raw.slice(0, 20) : raw;
    };
    
    setVal('#vDateF', p.formTypeCode === 'MATERIAL_GATE_PASS' ? p.dateFiled : compactPersonDateFiled(p.dateFiled));
    setVal('#vControlNo', printableControlNo(p.controlNo));
    setVal('#vName', p.userName);
    setVal('#vDest', p.destination);
    setVal('#vPurp', p.purpose);
    setVal('#vExpOut', p.expectedOut);
    setVal('#vExpInLabel', p.expectedIn);
    setVal('#vReturn', p.willReturn ? 'Yes' : 'No');
    
    let vehicleString = 'N/A';
    if (p.vehicle) {
        if (p.vehicle.id === 'MANUAL') vehicleString = p.vehicle.name;
        else vehicleString = `${p.vehicle.name} [${p.vehicle.plate}]`;
    }
    setVal('#vDriver', p.vehicle ? p.vehicle.driver : 'N/A');
    setVal('#vPlate', vehicleString);
    
    const handleSig = async (sigData, selector) => {
        const el = clone.querySelector(selector);
        const nameSpan = clone.querySelector(selector + 'Name');
        if (el) el.innerHTML = '';
        if (nameSpan) { nameSpan.innerText = ''; nameSpan.classList.add('hidden'); }
        if (!sigData) return;
        
        if (nameSpan) {
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
            } catch {}
        }
        if (el) {
            if (sigData.img) {
                const w = sigData.w || 100;
                const y = sigData.y || 0;
                el.innerHTML = `<img src="${sigData.img}" class="signature-img" style="width: ${w}%; margin-bottom: ${y}px;">`;
            } else {
                el.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 14px; color: blue;">Digitally Signed</span>`;
            }
        }
    };
    
    await handleSig(p.signatures.imm, '#sigImm');
    await handleSig(p.signatures.pres, '#sigPres');
    await handleSig(p.signatures.pas, '#sigPAS');
    
    const qrContainer = clone.querySelector('#qrCodeDisplay');
    if (qrContainer) {
        qrContainer.innerHTML = '';
        if (['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status)) {
            try {
                const qrValue = await loadQrToken(p);
                if (qrValue) {
                    new QRCode(qrContainer, {
                        text: String(qrValue),
                        width: 60,
                        height: 60
                    });
                }
            } catch {
                qrContainer.innerHTML = '<span class="text-[9px] text-gray-400">QR unavailable</span>';
            }
        }
    }
    
    const qrBackContainer = clone.querySelector('#qrCodeBackDisplay');
    if (qrBackContainer) {
        qrBackContainer.innerHTML = '';
        if (['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status)) {
            try {
                const qrValue = await loadQrToken(p);
                if (qrValue) {
                    new QRCode(qrBackContainer, {
                        text: String(qrValue),
                        width: 140,
                        height: 140
                    });
                }
            } catch {}
        }
    }
    
    return clone;
}

async function renderMaterialGatePassClone(p) {
    const pages = [];
    const itemRows = [...(p.materialItems || [])];
    const pageCount = Math.max(1, Math.ceil(itemRows.length / 9));
    const formDate = p.formDate
        ? new Date(`${String(p.formDate).slice(0, 10)}T00:00:00`).toLocaleDateString()
        : p.dateFiled;
    const controlNo = String(p.controlNo || p.id || '').trim().slice(0, 20);

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
        const pageItems = itemRows.slice(pageIndex * 9, pageIndex * 9 + 9);
        while (pageItems.length < 9) pageItems.push(null);

        const div = document.createElement('div');
        div.className = 'material-print-page multi-print-item';
        div.setAttribute('data-material-page', pageIndex + 1);

        const rowsHtml = pageItems.map(item => item
            ? `<tr>
                <td>${materialEscape(item.itemNo || '')}</td>
                <td>${materialEscape(item.description)}</td>
                <td class="text-center">${materialEscape(Number(item.quantity).toLocaleString(undefined, { maximumFractionDigits: 3 }))}</td>
                <td class="text-center">${materialEscape(item.unit)}</td>
            </tr>`
            : '<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>')
            .join('');

        div.innerHTML = `
            <div class="material-form-header">
                <div class="material-document-qr"></div>
                <div class="material-form-brand">
                    <img src="Frontend/Design/images/logo.png" alt="MPI Logo">
                    <div>
                        <h1>MORIROKU PHILIPPINES, INC.</h1>
                        <p>115 North Science Avenue, Laguna Technopark 4024, Biñan, Laguna Philippines</p>
                    </div>
                </div>
                <div class="material-form-control">
                    <span class="text-[6.5px] block font-bold text-gray-500 uppercase leading-none">CONTROL NO.</span>
                    <strong class="text-[10px] font-mono leading-none tracking-wider">${controlNo}</strong>
                </div>
            </div>
            
            <h2 class="text-center font-bold text-xs py-0.5 border-y border-gray-900 mt-1 uppercase" style="background-color: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact;">MATERIAL GATE PASS</h2>
            
            <table class="w-full text-left border-collapse border border-gray-900 mt-1.5 text-[9px] leading-tight">
                <tbody>
                    <tr>
                        <td class="w-[8%] border border-gray-900 p-1 font-bold text-gray-500">TO:</td>
                        <td class="w-[42%] border border-gray-900 p-1">${materialEscape(p.authorizedEmployeeName || 'GUARD ON DUTY')}</td>
                        <td class="w-[12%] border border-gray-900 p-1 font-bold text-gray-500">DATE:</td>
                        <td class="w-[38%] border border-gray-900 p-1">${formDate}</td>
                    </tr>
                    <tr>
                        <td class="border border-gray-900 p-1 font-bold text-gray-500">FROM:</td>
                        <td class="border border-gray-900 p-1">${materialEscape(p.userDept || '')}</td>
                        <td class="border border-gray-900 p-1 font-bold text-gray-500">PAGE:</td>
                        <td class="border border-gray-900 p-1 font-mono">${pageIndex + 1} OF ${pageCount}</td>
                    </tr>
                    <tr>
                        <td colspan="4" class="p-1 leading-normal">
                            This is to allow Mr. / Ms. <strong class="underline">${materialEscape(p.userName || '')}</strong> of <strong class="underline">${materialEscape(p.userDept || '')}</strong> to bring out the following items:
                        </td>
                    </tr>
                </tbody>
            </table>

            <table class="w-full text-[9px] border-collapse border border-gray-900 mt-1 text-left material-items-table">
                <thead>
                    <tr class="bg-gray-100 font-bold border-b border-gray-900" style="background-color: #f3f4f6; -webkit-print-color-adjust: exact; print-color-adjust: exact;">
                        <th class="border border-gray-900 p-1 w-[12%]">ITEM NO.</th>
                        <th class="border border-gray-900 p-1 w-[53%]">DESCRIPTION</th>
                        <th class="border border-gray-900 p-1 w-[18%] text-center">QUANTITY</th>
                        <th class="border border-gray-900 p-1 w-[17%] text-center">UNIT</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <div class="mt-1 text-[8.5px] leading-tight">
                <strong>REMARKS:</strong> <span class="ml-1">${materialEscape(p.purpose || '')}</span>
            </div>

            <div class="material-form-signatures mt-1 border-t border-gray-900 pt-1">
                <div>
                    <strong>Prepared By:</strong>
                    <div class="sig-wrapper sig-mat-prepared material-signature-image"></div>
                    <span class="name sig-mat-prepared-name">${materialEscape(p.userName || '')}</span>
                </div>
                <div>
                    <strong>Noted By:</strong>
                    <div class="sig-wrapper sig-mat-superior material-signature-image"></div>
                    <span class="name sig-mat-superior-name"></span>
                    <small>Immediate Superior</small>
                </div>
                <div>
                    <strong>Approved By:</strong>
                    <div class="sig-wrapper sig-mat-pas material-signature-image"></div>
                    <span class="name sig-mat-pas-name"></span>
                    <small>Personnel &amp; Admin Section</small>
                </div>
            </div>
            
            <div class="text-[7.5px] text-right text-gray-500 absolute bottom-1.5 right-3 leading-none select-none">Page ${pageIndex + 1} of ${pageCount}</div>
        `;

        const qrContainer = div.querySelector('.material-document-qr');
        if (qrContainer && ['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status)) {
            try {
                const qrValue = await loadQrToken(p);
                if (qrValue) {
                    new QRCode(qrContainer, {
                        text: String(qrValue),
                        width: 50,
                        height: 50
                    });
                }
            } catch {
                qrContainer.innerHTML = '<span class="text-[8px] text-gray-400">QR error</span>';
            }
        }

        const handleSig = async (sigData, wrapperSelector, nameSelector) => {
            const wrapperEls = div.querySelectorAll(wrapperSelector);
            const nameEls = div.querySelectorAll(nameSelector);
            
            nameEls.forEach(el => {
                if (sigData) {
                    el.innerText = sigData.name;
                    el.classList.remove('hidden');
                }
            });
            
            if (sigData && sigData.fileId && !sigData.img && isDatabaseSession()) {
                try {
                    const blob = await ApiClient.blob(`/signatures/${sigData.fileId}`);
                    sigData.img = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onload = () => resolve(reader.result);
                        reader.readAsDataURL(blob);
                    });
                } catch {}
            }
            
            wrapperEls.forEach(el => {
                if (sigData) {
                    if (sigData.img) {
                        el.innerHTML = `<img src="${sigData.img}" class="signature-img" style="width: 100%; max-height: 45px; object-fit: contain;">`;
                    } else {
                        el.innerHTML = `<span style="font-family: serif; font-style: italic; font-size: 11px; color: blue;">Digitally Signed</span>`;
                    }
                }
            });
        };

        await handleSig(p.signatures.imm, '.sig-mat-superior', '.sig-mat-superior-name');
        await handleSig(p.signatures.pas, '.sig-mat-pas', '.sig-mat-pas-name');

        const preparedSignature = p.preparedBySignatureFileId
            ? {
                name: p.userName,
                fileId: p.preparedBySignatureFileId,
                w: 100,
                y: 0
            }
            : null;
        if (preparedSignature) {
            await handleSig(preparedSignature, '.sig-mat-prepared', '.sig-mat-prepared-name');
        } else {
            const preparedWrapper = div.querySelector('.sig-mat-prepared');
            if (preparedWrapper) {
                preparedWrapper.innerHTML = '<span style="font-family:serif;font-style:italic;font-size:11px;color:#155CA2;">Digitally Prepared</span>';
            }
        }

        pages.push(div);
    }
    
    const backDiv = document.createElement('div');
    backDiv.className = 'qr-back-page material-print-page multi-print-item';
    backDiv.style.cssText = 'page-break-before: always; height: 105mm; width: 148mm; display: flex; align-items: center; justify-content: center; flex-direction: column; box-sizing: border-box; border: 1px dashed #ccc;';
    backDiv.innerHTML = `
        <h3 class="text-2xl font-bold mb-4">Gate Pass QR Code</h3>
        <div class="material-document-qr-back flex items-center justify-center p-4 bg-white border-4 border-black rounded-lg"></div>
        <p class="mt-4 text-gray-500 font-mono text-center">${controlNo}</p>
    `;

    if (['Approved', 'Outside', 'Overdue', 'Returned', 'Closed'].includes(p.status)) {
        try {
            const qrValue = await loadQrToken(p);
            if (qrValue && typeof QRCode === 'function') {
                new QRCode(backDiv.querySelector('.material-document-qr-back'), {
                    text: String(qrValue),
                    width: 200,
                    height: 200
                });
            }
        } catch {}
    }
    pages.push(backDiv);

    return pages;
}

async function printSelectedLogs() {
    const checked = document.querySelectorAll('#adminLogsTable .log-checkbox:checked');
    const ids = Array.from(checked).map(cb => cb.getAttribute('data-id'));
    if (ids.length === 0) return;

    showToast(`Loading ${ids.length} document(s)...`, 'info');

    try {
        const multiContainer = document.getElementById('multiPrintableArea');
        if (!multiContainer) return;
        multiContainer.innerHTML = '';
        multiContainer.classList.remove('hidden');

        document.getElementById('printableArea')?.classList.add('hidden');
        document.getElementById('materialPrintableArea')?.classList.add('hidden');

        const pagesPairs = [];

        for (const id of ids) {
            const p = await getGatePassDetail(id);
            if (!p) continue;

            const isMaterial = p.formTypeCode === 'MATERIAL_GATE_PASS';
            if (isMaterial) {
                const pages = await renderMaterialGatePassClone(p);
                const back = pages.pop(); 
                for (let i = 0; i < pages.length; i++) {
                    if (i === pages.length - 1) {
                        pagesPairs.push({ front: pages[i], back: back });
                    } else {
                        const emptyBack = document.createElement('div');
                        emptyBack.style.cssText = 'height: 105mm; width: 148mm; display: flex; align-items: center; justify-content: center; color: #ccc; font-size: 10px;';
                        emptyBack.innerText = '(Intentionally Blank)';
                        pagesPairs.push({ front: pages[i], back: emptyBack });
                    }
                }
            } else {
                const front = await renderPersonGatePassClone(p);
                const back = front.querySelector('.qr-back-page');
                if (back) front.removeChild(back);
                
                // Enforce A6 bounds on Person Pass so it stacks nicely
                front.style.width = '148mm';
                front.style.height = '105mm';
                front.style.border = '1px dashed #ccc';
                if(back) {
                    back.style.width = '148mm';
                    back.style.height = '105mm';
                    back.style.border = '1px dashed #ccc';
                }
                
                pagesPairs.push({ front, back });
            }
        }

        for (let i = 0; i < pagesPairs.length; i += 2) {
            const pair1 = pagesPairs[i];
            const pair2 = pagesPairs[i + 1];

            const a4Front = document.createElement('div');
            a4Front.className = 'a4-wrapper';
            a4Front.style.cssText = 'display: flex; flex-direction: column; gap: 0; page-break-after: always; width: 210mm; height: 297mm; max-height: 297mm; overflow: hidden; align-items: center; justify-content: flex-start; padding-top: 10mm; box-sizing: border-box;';
            
            pair1.front.style.cssText += 'page-break-after: avoid !important; break-after: avoid !important; margin-bottom: 10mm !important; box-shadow: none !important; margin-top: 0 !important;';
            a4Front.appendChild(pair1.front);
            
            if (pair2) {
                pair2.front.style.cssText += 'page-break-after: avoid !important; break-after: avoid !important; margin-bottom: 0 !important; box-shadow: none !important; margin-top: 0 !important;';
                a4Front.appendChild(pair2.front);
            }
            multiContainer.appendChild(a4Front);

            const a4Back = document.createElement('div');
            a4Back.className = 'a4-wrapper';
            a4Back.style.cssText = 'display: flex; flex-direction: column; gap: 0; page-break-after: always; width: 210mm; height: 297mm; max-height: 297mm; overflow: hidden; align-items: center; justify-content: flex-start; padding-top: 10mm; box-sizing: border-box;';
            
            if (pair1.back) {
                pair1.back.style.cssText += 'page-break-before: avoid !important; break-before: avoid !important; page-break-after: avoid !important; break-after: avoid !important; margin-bottom: 10mm !important; margin-top: 0 !important;';
                a4Back.appendChild(pair1.back);
            } else {
                const empty = document.createElement('div');
                empty.style.cssText = 'height: 105mm; width: 148mm; margin-bottom: 10mm;';
                a4Back.appendChild(empty);
            }
            
            if (pair2) {
                if (pair2.back) {
                    pair2.back.style.cssText += 'page-break-before: avoid !important; break-before: avoid !important; page-break-after: avoid !important; break-after: avoid !important; margin-bottom: 0 !important; margin-top: 0 !important;';
                    a4Back.appendChild(pair2.back);
                } else {
                    const empty = document.createElement('div');
                    empty.style.cssText = 'height: 105mm; width: 148mm; margin-bottom: 0;';
                    a4Back.appendChild(empty);
                }
            }
            multiContainer.appendChild(a4Back);
        }

        const modal = document.getElementById('printModal');
        const content = document.getElementById('printModalContent');
        if (modal && content) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            setTimeout(() => {
                modal.classList.remove('opacity-0');
                content.classList.remove('scale-95');
                content.classList.add('scale-100');
            }, 50);
        }

        setTimeout(() => {
            window.print();
        }, 1000); // 1 sec delay to ensure QR & signatures load/paint

    } catch (error) {
        showToast('Error preparing batch print.', 'error');
        console.error(error);
    }
}

window.clamp = clamp;
window.scheduleModalBoxUpdate = scheduleModalBoxUpdate;
window.setModalInteractionState = setModalInteractionState;
window.prepareModalForFloating = prepareModalForFloating;
window.resetDocumentModalLayout = resetDocumentModalLayout;
window.initializeModalDragResize = initializeModalDragResize;
window.toggleMaximizeModal = toggleMaximizeModal;
window.updateModalExpandButton = updateModalExpandButton;
window.renderMaterialBundle = renderMaterialBundle;
window.syncMaterialSignatureCopies = syncMaterialSignatureCopies;
window.viewPass = viewPass;
window.closeModal = closeModal;
window.forceCloseModal = forceCloseModal;
window.printSelectedLogs = printSelectedLogs;
