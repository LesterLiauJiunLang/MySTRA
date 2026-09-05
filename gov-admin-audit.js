document.addEventListener('DOMContentLoaded', () => {
    // 只有在 Audit Log 页面才初始化视图管理
    if (document.getElementById('tbl-audit-body') || document.getElementById('input-audit-search')) {
        window.auditApp = new GovAuditLogDirectory();
    }
});

class GovAuditLogDirectory {
    constructor() {
        this.rawLogs = [];
        this.initRetries = 0;
        this.maxRetries = 30; // 最多轮询等待 30 次 (约 9 秒)
        this.init();
    }

    async init() {
        if (!window.supabaseClient) {
            if (this.initRetries >= this.maxRetries) {
                console.error('❌ [Audit] 初始化超时：未能在预定时间内检测到 window.supabaseClient。');
                return;
            }
            this.initRetries++;
            setTimeout(() => this.init(), 300);
            return;
        }
        
        this.bindEvents();
        await this.loadAuditLogs();
    }

    /**
     * 【审计日志记录】：无需 Supabase Auth Session 即可写入，同时精准记录操作人名字
     * 
     * @param {Object} params
     * @param {string} [params.performerName='System Admin'] - 操作员姓名/编号 (例: 'Officer Tan', 'ADMIN-001')
     * @param {string} [params.registrationCode=null] - 申请单号
     * @param {string} [params.targetDocId=null] - 目标文档 ID
     * @param {string} params.actionDetails - 操作细节说明
     * @param {boolean} [params.isValidPass=true] - 操作状态/结果
     * @param {string} [params.requestingOta='GOV_ADMIN'] - 请求来源标识
     */
    static async logAction({ 
        performerName = 'System Admin', 
        registrationCode = null, 
        targetDocId = null, 
        actionDetails = '', 
        isValidPass = true, 
        requestingOta = 'GOV_ADMIN' 
    }) {
        try {
            if (!window.supabaseClient) {
                console.error('❌ [Audit] Supabase 客户端未初始化，无法写入日志。');
                return { success: false, error: 'Supabase client missing' };
            }

            // 1. 尝试获取当前的 Auth Session UUID
            let officerUuid = null;
            try {
                const { data: { user } } = await window.supabaseClient.auth.getUser();
                if (user && user.id) {
                    officerUuid = user.id;
                }
            } catch (authErr) {
                // 忽略未登录报错
            }

            // 2. 将操作人姓名/标识融合写入 action_details（作为未关联 profiles 时的降级方案）
            const safePerformer = performerName || 'System Admin';
            const formattedActionDetails = `[Actor: ${safePerformer}] ${actionDetails}`;

            // 3. 构造数据库插入 Payload
            const insertPayload = {
                registration_code: registrationCode,
                target_doc_id: targetDocId,
                action_details: formattedActionDetails,
                is_valid_pass: isValidPass,
                requesting_ota: requestingOta
            };

            if (officerUuid) {
                insertPayload.officer_id = officerUuid;
            }

            // 4. 执行写入
            const { data, error } = await window.supabaseClient
                .from('interceptor_audit_logs')
                .insert([insertPayload])
                .select();

            if (error) {
                console.error('❌ [Audit] Supabase 数据库插入失败:', error.message);
                return { success: false, error: error.message };
            }

            console.log('✅ [Audit] 日志已成功写入 Supabase:', data);

            // 5. 自动刷新页面展示
            if (window.auditApp && typeof window.auditApp.loadAuditLogs === 'function') {
                await window.auditApp.loadAuditLogs();
            }

            return { success: true, data };
        } catch (err) {
            console.error('❌ [Audit] 记录日志时发生未知异常:', err);
            return { success: false, error: err.message };
        }
    }

    // 实例方法包装器
    async recordAudit(params) {
        return await GovAuditLogDirectory.logAction(params);
    }

    bindEvents() {
        const searchInput = document.getElementById('input-audit-search');
        if (searchInput) {
            searchInput.addEventListener('input', this.debounce(() => this.filterLogs(), 200));
        }

        const selectFilter = document.getElementById('select-audit-filter') || 
                             document.getElementById('select-audit-action') || 
                             document.querySelector('select');

        if (selectFilter) {
            selectFilter.addEventListener('change', () => this.filterLogs());
        }
    }

    async loadAuditLogs() {
        const tableBody = document.getElementById('tbl-audit-body');
        const countLabel = document.getElementById('lbl-audit-count') || document.getElementById('total-recorded-logs');

        try {
            // 1. 查询审计日志单表数据（彻底解耦 Supabase 外键约束依赖，100% 避免 Embedding 连表报错）
            const { data: logs, error: logErr } = await window.supabaseClient
                .from('interceptor_audit_logs')
                .select('*');

            if (logErr) {
                throw new Error(logErr.message);
            }

            let logData = logs || [];

            // 2. 提取所有非空的 officer_id，批量向 profiles 表查询对应管理员信息
            const officerIds = [...new Set(logData.map(l => l.officer_id).filter(Boolean))];
            const profileMap = {};

            if (officerIds.length > 0) {
                try {
                    const { data: profiles } = await window.supabaseClient
                        .from('profiles')
                        .select('id, full_name, role')
                        .in('id', officerIds);

                    if (profiles && Array.isArray(profiles)) {
                        profiles.forEach(p => {
                            if (p && p.id) {
                                profileMap[p.id] = p;
                            }
                        });
                    }
                } catch (pErr) {
                    console.warn('⚠️ [Audit] 获取 profiles 列表失败，降级使用 [Actor: xxx] 提取名称:', pErr);
                }
            }

            // 3. 将 profiles 回填至对应 log 记录，并按最新时间倒序排列（最新的显示在最上面）
            this.rawLogs = logData.map(log => ({
                ...log,
                profiles: log.officer_id ? (profileMap[log.officer_id] || null) : null
            })).sort((a, b) => {
                const timeA = new Date(a.timestamp || a.created_at || 0).getTime();
                const timeB = new Date(b.timestamp || b.created_at || 0).getTime();
                return timeB - timeA; // 最新时间置顶
            });

            if (this.rawLogs.length === 0) {
                if (tableBody) tableBody.innerHTML = '';
                this.toggleEmptyState(true);
                if (countLabel) countLabel.innerText = '0';
                return;
            }

            this.toggleEmptyState(false);
            this.renderRows(this.rawLogs);

        } catch (err) {
            console.error('❌ [Audit] 加载日志异常:', err);
            if (tableBody) {
                tableBody.innerHTML = `<tr><td colspan="5" style="color:#EF4444; text-align:center; padding:20px;">加载日志失败: ${this.escapeHtml(err.message)}</td></tr>`;
            }
        }
    }

    renderRows(logs) {
        const tableBody = document.getElementById('tbl-audit-body');
        const countLabel = document.getElementById('lbl-audit-count') || document.getElementById('total-recorded-logs');

        if (countLabel) countLabel.innerText = logs.length.toString();

        if (logs.length === 0) {
            if (tableBody) tableBody.innerHTML = '';
            this.toggleEmptyState(true);
            return;
        }

        this.toggleEmptyState(false);

        if (tableBody) {
            tableBody.innerHTML = logs.map(log => {
                const logTime = log.timestamp || log.created_at;
                const formattedDate = logTime ? new Date(logTime).toLocaleString() : 'N/A';
                
                let rawDetails = String(log.action_details || 'Application Audit Update');

                // 1. 优先读取 profiles 表中的 full_name
                let adminName = log.profiles?.full_name;

                // 2. 尝试提取 [Actor: xxx] 并清洗详情字段
                const actorMatch = rawDetails.match(/^\[Actor:\s*([^\]]+)\]\s*(.*)$/);
                if (actorMatch) {
                    // 仅当 profiles 表未返回 full_name 时，才退回使用 [Actor: xxx]
                    if (!adminName) {
                        adminName = actorMatch[1];
                    }
                    rawDetails = actorMatch[2]; // 清除掉 [Actor: xxx] 标签，还原真实描述
                }

                // 3. 兜底默认值
                if (!adminName) {
                    adminName = 'System Admin';
                }
                
                const officerUuid = log.officer_id ? `#${String(log.officer_id).substring(0, 8)}` : (log.requesting_ota || 'GOV_ADMIN');
                const docRef = log.registration_code ? `#${String(log.registration_code).substring(0, 12)}` : (log.target_doc_id ? `#${String(log.target_doc_id).substring(0, 8)}` : 'N/A');

                let actionText = rawDetails;
                let statusBadge = '';

                const searchContent = `${adminName} ${officerUuid} ${rawDetails} ${log.status || ''}`.toUpperCase();

                if (searchContent.includes('APPROVED') || log.is_valid_pass === true) {
                    actionText = rawDetails || 'Application Approved & Verified';
                    statusBadge = `<span class="badge-pass" style="background:#D1FAE5; color:#065F46; padding:4px 8px; border-radius:4px; font-weight:700; font-size:11px;">APPROVED</span>`;
                } else if (searchContent.includes('REJECTED') || searchContent.includes('FAIL')) {
                    actionText = rawDetails || 'Application Rejected';
                    statusBadge = `<span class="badge-fail" style="background:#FEE2E2; color:#991B1B; padding:4px 8px; border-radius:4px; font-weight:700; font-size:11px;">REJECTED</span>`;
                } else if (searchContent.includes('REUPLOAD') || searchContent.includes('REVISION')) {
                    actionText = rawDetails || 'Re-upload Requested';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #FEF3C7; color: #92400E;">REVISION REQ</span>`;
                } else {
                    actionText = rawDetails || 'Application Flagged / Action Required';
                    statusBadge = `<span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700; background-color: #FEF3C7; color: #92400E;">ACTION REQ</span>`;
                }

                const safeAdminName = this.escapeHtml(adminName);
                const safeOfficerUuid = this.escapeHtml(officerUuid);
                const safeDocRef = this.escapeHtml(docRef);
                const safeActionText = this.escapeHtml(actionText);
                const safeFormattedDate = this.escapeHtml(formattedDate);

                return `
                    <tr style="border-bottom: 1px solid #E2E8F0;">
                        <td style="font-family: monospace; color: #475569; white-space: nowrap; padding: 12px 16px;">
                            ${safeFormattedDate}
                        </td>
                        <td style="padding: 12px 16px;">
                            <div style="font-weight: 600; color: #0F172A;">🛡️ ${safeAdminName}</div>
                            <div style="font-size: 11px; color: #64748B; font-family: monospace;">ID: ${safeOfficerUuid}</div>
                        </td>
                        <td style="font-family: monospace; color: #2563EB; font-weight: 600; padding: 12px 16px;">
                            ${safeDocRef}
                        </td>
                        <td style="color: #334155; padding: 12px 16px;">
                            ${safeActionText}
                        </td>
                        <td style="padding: 12px 16px;">
                            ${statusBadge}
                        </td>
                    </tr>
                `;
            }).join('');
        }
    }

    filterLogs() {
        const searchInput = document.getElementById('input-audit-search');
        const selectFilter = document.getElementById('select-audit-filter') || 
                             document.getElementById('select-audit-action') || 
                             document.querySelector('select');

        const rawQuery = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const cleanQuery = rawQuery.replace(/^#/, '');

        const selectedVal = selectFilter ? selectFilter.value.toUpperCase() : 'ALL';

        const filtered = this.rawLogs.filter(log => {
            const targetDocId = (log.target_doc_id || '').toLowerCase();
            const regCode = (log.registration_code || '').toLowerCase();
            const officerId = (log.officer_id || '').toLowerCase();
            const rawDetails = String(log.action_details || '');
            
            let adminName = (log.profiles?.full_name || '').toLowerCase();
            let cleanedDetails = rawDetails.toLowerCase();

            const actorMatch = rawDetails.match(/^\[Actor:\s*([^\]]+)\]\s*(.*)$/);
            if (actorMatch) {
                if (!adminName) {
                    adminName = actorMatch[1].toLowerCase();
                }
                cleanedDetails = actorMatch[2].toLowerCase();
            }

            if (!adminName) {
                adminName = 'system admin';
            }

            const logTime = log.timestamp || log.created_at;
            const dateStr = logTime ? new Date(logTime).toLocaleString().toLowerCase() : '';

            const matchesSearch = !rawQuery || 
                targetDocId.includes(cleanQuery) ||
                regCode.includes(cleanQuery) ||
                officerId.includes(rawQuery) ||
                adminName.includes(rawQuery) ||
                cleanedDetails.includes(rawQuery) ||
                dateStr.includes(rawQuery);

            let matchesStatus = true;
            const fullLogStr = `${adminName} ${officerId} ${rawDetails} ${log.status || ''}`.toUpperCase();

            if (selectedVal !== 'ALL') {
                if (selectedVal === 'APPROVED') {
                    matchesStatus = log.is_valid_pass === true || fullLogStr.includes('APPROVED');
                } else if (selectedVal === 'REJECTED') {
                    matchesStatus = fullLogStr.includes('REJECTED') || fullLogStr.includes('FAIL');
                } else if (selectedVal === 'REUPLOAD_REQUESTED' || selectedVal === 'REVISION') {
                    matchesStatus = fullLogStr.includes('REUPLOAD') || fullLogStr.includes('REVISION');
                }
            }

            return matchesSearch && matchesStatus;
        });

        this.renderRows(filtered);
    }

    toggleEmptyState(show) {
        const emptyState = document.getElementById('audit-empty-state') || document.getElementById('no-audit-logs-msg');
        if (!emptyState) return;

        if (show) {
            emptyState.classList.remove('hidden');
            emptyState.style.display = 'block';
        } else {
            emptyState.classList.add('hidden');
            emptyState.style.display = 'none';
        }
    }

    escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    debounce(fn, delay) {
        let timer = null;
        return function (...args) {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => fn.apply(this, args), delay);
        };
    }
}

window.GovAuditLogDirectory = GovAuditLogDirectory;

async function handleLogout(event) {
    if (event) event.preventDefault();

    if (!window.supabaseClient) {
        console.error('❌ Supabase 客户端未初始化');
        return;
    }

    try {
        // 1. 记录登出审计日志（若 GovAuditLogDirectory 存在）
        if (window.GovAuditLogDirectory) {
            await window.GovAuditLogDirectory.logAction({
                actionDetails: 'Admin logged out',
                isValidPass: true
            });
        }

        // 2. 执行 Supabase Auth 注销
        const { error } = await window.supabaseClient.auth.signOut();

        if (error) {
            alert('Logout Failed: ' + error.message);
            return;
        }

        // 3. 清理 Session 并重定向
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = 'login.html';

    } catch (err) {
        console.error('❌ Logout Exception:', err);
    }
}