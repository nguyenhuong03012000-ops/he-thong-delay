const fs = require('fs');
let code = fs.readFileSync('delay_v25.js', 'utf8');

// Build Excel Filter Population Logic
const excelLogic = `
        function populateExcelFilters(group, data) {
            const tableElement = document.querySelector(\`table[data-group="\${group}"]\`);
            if (!tableElement) return;

            const cols = ['all_tags', 'status', 'days_since_ship', 'days_since_update', 'reason'];
            cols.forEach(col => {
                const container = tableElement.querySelector(\`\.excel-filter[data-col="\${col}"]\`);
                if (!container) return;
                
                const dropdown = container.querySelector('.ef-dropdown');
                if (!dropdown) return;
                
                // Get unique values sorted
                let uniques = [];
                if (col === 'all_tags') {
                    const tagSet = new Set();
                    data.forEach(o => {
                        if (o.all_tags) o.all_tags.split(' | ').forEach(t => { if(t) tagSet.add(t); });
                    });
                    uniques = [...tagSet].sort();
                } else if (col === 'days_since_ship' || col === 'days_since_update') {
                    uniques = [...new Set(data.map(o => o[col]))].filter(x => x !== null && x !== undefined).sort((a,b) => b - a); // Descending for days
                } else {
                    uniques = [...new Set(data.map(o => o[col]))].filter(Boolean).sort();
                }

                // Preserve checked states before rewriting
                const existingChecked = Array.from(dropdown.querySelectorAll('input:checked')).map(i => i.value);
                
                let html = '';
                uniques.forEach(val => {
                    const checkedStr = existingChecked.includes(String(val)) ? 'checked' : '';
                    html += \`<label><input type="checkbox" value="\${val}" \${checkedStr}> \${val}</label>\`;
                });
                
                // Only update if content changed or is empty
                if (html !== dropdown.innerHTML) dropdown.innerHTML = html;
                
                // Add change listeners to checkboxes
                dropdown.querySelectorAll('input').forEach(chk => {
                    chk.addEventListener('change', () => {
                        updateHeader(container);
                        renderLocalTableOnly(group);
                    });
                });
                updateHeader(container);
            });
        }
        
        function updateHeader(container) {
            const header = container.querySelector('.ef-header');
            const chks = Array.from(container.querySelectorAll('input:checked'));
            if (chks.length === 0) header.textContent = 'All';
            else if (chks.length === 1) header.textContent = chks[0].value;
            else header.textContent = 'Multiple (' + chks.length + ')';
        }

        // Global dropdown toggle logic
        document.addEventListener('click', e => {
            const isHeader = e.target.closest('.ef-header');
            if (isHeader) {
                const drop = isHeader.nextElementSibling;
                const isVis = drop.style.display === 'block';
                document.querySelectorAll('.ef-dropdown').forEach(d => d.style.display = 'none');
                drop.style.display = isVis ? 'none' : 'block';
                return;
            }
            if (!e.target.closest('.excel-filter')) {
                document.querySelectorAll('.ef-dropdown').forEach(d => d.style.display = 'none');
            }
        });
`;

// Build the filtering logic update
const filterLogic = `
    function getLocalFilteredData(group) {
        if (!window._currentDelayResults || !window._currentDelayResults[group]) return [];
        const baseData = window._currentDelayResults[group];

        const tableElement = document.querySelector(\`table[data-group="\${group}"]\`);
        if (!tableElement) return baseData;

        const fCustomer = tableElement.querySelector('.tbl-filter-customer') ? tableElement.querySelector('.tbl-filter-customer').value.toLowerCase().trim() : '';

        const getChecked = (col) => {
            const c = tableElement.querySelector(\`\.excel-filter[data-col="\${col}"]\`);
            if(!c) return [];
            return Array.from(c.querySelectorAll('input:checked')).map(i => i.value);
        };

        const fTags = getChecked('all_tags');
        const fStatus = getChecked('status');
        const fDaysShipStr = getChecked('days_since_ship');
        const fDaysUpdStr = getChecked('days_since_update');
        const fReason = getChecked('reason');

        return baseData.filter(o => {
            if (fCustomer && !String(o.customer_name).toLowerCase().includes(fCustomer)) return false;
            
            if (fTags.length > 0) {
                let tagsStr = Array.isArray(o.order_tags) ? o.order_tags.join(' ') : String(o.order_tags);
                if (!fTags.some(t => tagsStr.includes(t))) return false;
            }
            
            if (fStatus.length > 0 && !fStatus.includes(o.status)) return false;
            if (fDaysShipStr.length > 0 && !fDaysShipStr.includes(String(o.days_since_ship))) return false;
            if (fDaysUpdStr.length > 0 && !fDaysUpdStr.includes(String(o.days_since_update))) return false;
            if (fReason.length > 0 && !fReason.includes(o.reason)) return false;
            
            return true;
        });
    }
`;

// Regex replacement blocks
let m = code.match(/function populateLocalReasons[\s\S]*?populateLocalReasons\('appointment', res\.appointment\);/);
if (m) {
    code = code.replace(m[0], excelLogic + '\n        populateExcelFilters(\'needFollow\', res.needFollow);\n        populateExcelFilters(\'overdue\', res.overdue);\n        populateExcelFilters(\'appointment\', res.appointment);');
} else { throw new Error('populateLocalReasons block not found!'); }

m = code.match(/function getLocalFilteredData[\s\S]*?return true;\s*\}\);\s*\}/);
if (m) {
    code = code.replace(m[0], filterLogic);
} else { throw new Error('getLocalFilteredData block not found!'); }

m = code.match(/document\.querySelectorAll\('\.lf-tag, \.lf-status, \.lf-days-ship, \.lf-days-upd, \.lf-reason, \.tbl-filter-customer, \.tbl-filter-tag'\)[\s\S]*?\}\);/);
if (m) {
    code = code.replace(m[0], `document.querySelectorAll('.tbl-filter-customer').forEach(el => {
        el.addEventListener('input', () => {
             const group = el.closest('table').getAttribute('data-group');
             if (group) renderLocalTableOnly(group);
        });
    });`);
} else { throw new Error('global listeners block not found!'); }

fs.writeFileSync('delay_v25.js', code);
console.log('Script patched for V25 logic');
