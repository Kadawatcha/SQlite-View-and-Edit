document.addEventListener('DOMContentLoaded', () => { // Main function wrapper
    const fileInput = document.getElementById('dbFile');
    const tableListContainer = document.querySelector('#tableList .table-button-container');
    const tableDataContainer = document.querySelector('#tableData .table-responsive');
    const controlsDiv = document.getElementById('controls');
    const exportControlsDiv = document.getElementById('exportControls');
    const saveDbButton = document.getElementById('saveDb');
    const fileNameSpan = document.getElementById('fileName');

    let db;
    let currentActiveButton = null;
    let isDbModified = false;
    let currentLang = 'fr';

    // --- IndexedDB Persistence ---
    const DB_NAME = 'SQLiteViewerDB';
    const STORE_NAME = 'databaseFiles';
    let idb;

    async function initIndexedDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, 1);
            request.onerror = () => reject("Erreur IndexedDB: " + request.error);
            request.onsuccess = () => {
                idb = request.result;
                resolve(idb);
            };
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    async function saveDbToIndexedDB(data, name) {
        if (!idb) return;
        const transaction = idb.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        store.put(data, 'lastDb');
        store.put(name, 'lastDbName');
    }

    async function loadDbFromIndexedDB() {
        if (!idb) return null;
        return new Promise((resolve) => {
            const transaction = idb.transaction([STORE_NAME], 'readonly');
            const store = transaction.objectStore(STORE_NAME);
            const dataReq = store.get('lastDb');
            const nameReq = store.get('lastDbName');
            transaction.oncomplete = () => resolve({ data: dataReq.result, name: nameReq.result });
        });
    }

    // --- End IndexedDB ---

    // --- I18n (Internationalization) ---

    function applyTranslations() {
        document.documentElement.lang = currentLang;
        const elements = document.querySelectorAll('[data-i18n-key]');
        elements.forEach(el => {
            const key = el.getAttribute('data-i18n-key');
            let translation = translations[currentLang][key];
            if (translation) {
                // Replace placeholders like {year}
                translation = translation.replace('{year}', new Date().getFullYear());

                if (el.tagName === 'META' && el.name === 'description') {
                    el.content = translation;
                } else {
                    el.textContent = translation;
                }
            }
        });
    }

    function setLanguage(lang) {
        currentLang = lang;
        applyTranslations();
        // Update active button style
        document.querySelectorAll('.lang-switcher button').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.lang === lang);
        });
        // Re-display initial message or currently active table to update its title
        if (currentActiveButton) {
            // A table is active, re-render it
            const tableName = currentActiveButton.textContent;
            displayTableData(tableName);
        } else if (tableDataContainer.querySelector('p')) {
            tableDataContainer.innerHTML = `<p data-i18n-key="select_table_prompt">${translations[currentLang]['select_table_prompt']}</p>`;
        }
    }

    async function initializeAppWithDb(data, name) {
        try {
            const SQL = await initSqlJs(config);
            db = new SQL.Database(data);
            displayTables();
            controlsDiv.style.display = 'flex';
            saveDbButton.disabled = true;
            isDbModified = false;
            if (name) {
                fileNameSpan.textContent = name;
            }
        } catch (error) {
            console.error("Database loading error from memory:", error);
            alert(translations[currentLang]['load_error']);
        }
    }

    // --- End I18n ---

    const config = {
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${filename}`
    };

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            fileNameSpan.textContent = translations[currentLang]['no_file_selected'];
            return;
        }
        fileNameSpan.textContent = file.name;

        const fileBuffer = await file.arrayBuffer();
        await saveDbToIndexedDB(new Uint8Array(fileBuffer), file.name);
        await initializeAppWithDb(new Uint8Array(fileBuffer), file.name);
    });

    function displayTables() {
        tableListContainer.innerHTML = '';
        tableDataContainer.innerHTML = `<p data-i18n-key="select_table_prompt">${translations[currentLang]['select_table_prompt']}</p>`;
        exportControlsDiv.style.display = 'none'; // Cacher les contrôles d'export

        try {
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
            if (tables.length === 0 || tables[0].values.length === 0) {
                tableListContainer.innerHTML = `<p data-i18n-key="no_tables_found">${translations[currentLang]['no_tables_found']}</p>`;
                return;
            }

            tables[0].values.forEach(tableNameArr => {
                const tableName = tableNameArr[0];
                const button = document.createElement('button');
                button.className = 'table-button';
                button.textContent = tableName;
                button.onclick = () => {
                    if (currentActiveButton) {
                        currentActiveButton.classList.remove('active');
                    }
                    displayTableData(tableName);
                    button.classList.add('active');
                    currentActiveButton = button;
                };
                tableListContainer.appendChild(button);
            });
        } catch (error) {
            console.error("Error listing tables:", error);
            alert(translations[currentLang]['list_tables_error']);
        }
    }

    function isURL(str) {
        if (typeof str !== 'string') return false;
        try {
            const url = new URL(str);
            return url.protocol === "http:" || url.protocol === "https:";
        } catch (_) {
            return false;
        }
    }

    async function generateLinkPreview(url, container) {
        const previewContainer = document.createElement('div');
        previewContainer.style.cssText = 'display: flex; align-items: center; gap: 8px; margin-top: 5px; padding: 5px; border: 1px solid #eee; border-radius: 4px;';

        // Utiliser un proxy CORS pour récupérer les métadonnées de la page
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`;

        try {
            const response = await fetch(proxyUrl);
            if (!response.ok) throw new Error('Network response was not ok.');
            
            const data = await response.json();
            const htmlContent = data.contents;

            if (!htmlContent) {
                throw new Error("Could not fetch HTML content.");
            }

            const parser = new DOMParser();
            const doc = parser.parseFromString(htmlContent, 'text/html');
            
            const title = doc.querySelector('title')?.textContent || url;
            const faviconLink = doc.querySelector("link[rel*='icon']")?.href || `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}`;

            previewContainer.innerHTML = `
                <img src="${faviconLink}" alt="favicon" width="16" height="16" style="border-radius: 2px;" crossorigin="anonymous">
                <span style="font-size: 0.9em; color: #555; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${title}</span>
            `;
        } catch (error) {
            console.warn(`Could not generate preview for ${url}:`, error);
            // Fallback simple si l'aperçu échoue
            previewContainer.innerHTML = `<span style="font-size: 0.9em; color: #888;">Aperçu non disponible</span>`;
        }
        container.appendChild(previewContainer);
    }

    function displayTableData(tableName) {
        const headerText = translations[currentLang]['table_content_header'].replace('{tableName}', tableName);
        // Vider le conteneur de données mais garder le titre et les contrôles d'export
        const tableHeader = document.querySelector('#tableData .table-header-controls h2');
        tableHeader.innerHTML = headerText;
        tableDataContainer.innerHTML = ''; // Vider seulement la zone du tableau
    
        try {
            const pkeyInfo = db.exec(`PRAGMA table_info(${tableName})`);
            const pkeyColumn = pkeyInfo[0].values.find(col => col[5] === 1);
            if (!pkeyColumn) {
                const warningText = translations[currentLang]['no_pk_warning'].replace('{tableName}', tableName);
                console.warn(warningText);
            }
            const pkeyColumnName = pkeyColumn ? pkeyColumn[1] : null;

            const stmt = db.prepare(`SELECT * FROM ${tableName}`);
            const table = document.createElement('table');
            const thead = document.createElement('thead');
            const tbody = document.createElement('tbody');

            const headerRow = document.createElement('tr');
            stmt.getColumnNames().forEach(colName => {
                const th = document.createElement('th');
                th.textContent = colName;
                headerRow.appendChild(th);
            });
            thead.appendChild(headerRow);

            while (stmt.step()) {
                const row = stmt.getAsObject();
                const tr = document.createElement('tr');
                const pkeyValue = pkeyColumnName ? row[pkeyColumnName] : null;

                stmt.getColumnNames().forEach(colName => {
                    const td = document.createElement('td');
                    const value = row[colName];

                    if (value instanceof Uint8Array) {
                        try {
                            const blob = new Blob([value], { type: 'image/png' });
                            const url = URL.createObjectURL(blob);
                            const img = document.createElement('img');
                            img.src = url;
                            td.appendChild(img);
                        } catch (e) {
                            td.textContent = '[BLOB]';
                        }
                    } else {
                        const textValue = value === null ? 'NULL' : String(value);
                        if (isURL(textValue)) {
                            const linkWrapper = document.createElement('div');
                            const a = document.createElement('a');
                            a.href = textValue;
                            a.textContent = textValue;
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                            linkWrapper.appendChild(a);
                            td.appendChild(linkWrapper);
                            generateLinkPreview(textValue, linkWrapper);
                        } else {
                            td.textContent = textValue;
                        }
                    }

                    if (pkeyColumnName && colName !== pkeyColumnName) {
                        td.contentEditable = true;
                        td.addEventListener('keydown', (e) => {
                             if (e.key === 'Enter') {
                                e.preventDefault();
                                e.target.blur();
                            }
                        });
                        td.addEventListener('blur', (e) => {
                            // Si la cellule contient un lien, la valeur est dans le div > a
                            let newValue;
                            if (e.target.querySelector('a')) {
                                newValue = e.target.querySelector('a').textContent;
                            } else {
                                newValue = e.target.textContent;
                            }
                            updateCell(tableName, colName, newValue, pkeyColumnName, pkeyValue);
                        });
                    }
                    tr.appendChild(td);
                });
                tbody.appendChild(tr);
            }

            stmt.free();
            table.appendChild(thead);
            table.appendChild(tbody);
            tableDataContainer.appendChild(table);

            // Afficher et configurer les contrôles d'exportation
            setupExportControls(tableName);

        } catch (error) {
            console.error(`Error displaying table ${tableName}:`, error);
            const errorText = translations[currentLang]['display_table_error'].replace('{tableName}', tableName);
            alert(errorText);
        }
    }

    function setupExportControls(tableName) {
        exportControlsDiv.innerHTML = `
            <div class="export-group">
                <select id="exportFormat">
                    <option value="csv">${translations[currentLang]['export_format_csv']}</option>
                    <option value="xlsx">${translations[currentLang]['export_format_excel']}</option>
                </select>
                <button id="exportBtn" data-i18n-key="export_button">${translations[currentLang]['export_button']}</button>
            </div>
            <div class="export-group">
                <button id="exportAllBtn">${translations[currentLang]['export_format_zip_all']}</button>
            </div>
        `;
        exportControlsDiv.style.display = 'flex';

        document.getElementById('exportBtn').addEventListener('click', () => {
            const format = document.getElementById('exportFormat').value;
            exportTable(tableName, format);
        });

        document.getElementById('exportAllBtn').addEventListener('click', () => {
            exportAllTablesAsZip();
        });
    }

    function exportTable(tableName, format) {
        const results = db.exec(`SELECT * FROM ${tableName}`);
        if (!results || results.length === 0) return;

        const columns = results[0].columns;
        const data = results[0].values;

        if (format === 'csv') {
            exportToCSV(tableName, columns, data);
        } else if (format === 'xlsx') {
            exportToXLSX(tableName, columns, data);
        }
    }

    async function exportAllTablesAsZip() {
        const tablesResult = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
        if (!tablesResult || tablesResult.length === 0) return;

        const zip = new JSZip();
        const tableNames = tablesResult[0].values.map(row => row[0]);

        for (const tableName of tableNames) {
            const results = db.exec(`SELECT * FROM ${tableName}`);
            if (results && results.length > 0) {
                const columns = results[0].columns;
                const data = results[0].values;
                let csvContent = columns.map(escapeCSV).join(',') + '\r\n';
                data.forEach(row => {
                    csvContent += row.map(escapeCSV).join(',') + '\r\n';
                });
                zip.file(`${tableName}.csv`, csvContent);
            }
        }

        const zipBlob = await zip.generateAsync({ type: "blob" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(zipBlob);
        link.download = "database_export.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
    }

    function escapeCSV(str) {
        if (str === null || str === undefined) return '';
        str = String(str);
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
            return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
    }

    function exportToCSV(tableName, columns, data) {
        let csvContent = "data:text/csv;charset=utf-8,";
        csvContent += columns.map(escapeCSV).join(',') + '\r\n';

        data.forEach(row => {
            csvContent += row.map(escapeCSV).join(',') + '\r\n';
        });

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${tableName}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    function exportToXLSX(tableName, columns, data) {
        // La bibliothèque xlsx attend un tableau d'objets
        const dataAsObjects = data.map(row => {
            let obj = {};
            columns.forEach((col, index) => {
                obj[col] = row[index];
            });
            return obj;
        });

        const worksheet = XLSX.utils.json_to_sheet(dataAsObjects);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, tableName);
        XLSX.writeFile(workbook, `${tableName}.xlsx`);
    }

    function updateCell(tableName, colName, newValue, pkeyName, pkeyValue) {
        try {
            const stmt = db.prepare(`UPDATE \`${tableName}\` SET \`${colName}\` = :value WHERE \`${pkeyName}\` = :id`);
            stmt.bind({ ':value': newValue, ':id': pkeyValue });
            stmt.step();
            stmt.free();
            const successText = translations[currentLang]['update_success'].replace('{tableName}', tableName).replace('{colName}', colName).replace('{newValue}', newValue);
            console.log(successText);
            saveDbToIndexedDB(db.export(), fileNameSpan.textContent); // Save changes to IndexedDB
            if (!isDbModified) {
                isDbModified = true;
                saveDbButton.disabled = false; // Activer le bouton à la première modification
            }
        } catch (error) {
            console.error("Update error:", error);
            alert(translations[currentLang]['update_error']);
            displayTableData(tableName);
        }
    }

    saveDbButton.addEventListener('click', () => {
        if (!db) {
            alert(translations[currentLang]['no_db_loaded']);
            return;
        }
        try {
            const data = db.export();
            const blob = new Blob([data], { type: "application/octet-stream" });
            const a = document.createElement("a");
            a.href = window.URL.createObjectURL(blob);
            a.download = "database_modifiee.db";
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            window.URL.revokeObjectURL(a.href);
            // Réinitialiser l'état après la sauvegarde
            isDbModified = false;
            saveDbToIndexedDB(data, fileNameSpan.textContent); // Also update IndexedDB on explicit save
            saveDbButton.disabled = true;
        } catch (error) {
            console.error("Save error:", error);
            alert(translations[currentLang]['save_error']);
        }
    });

    // --- Initialisation ---

    async function start() {
        // Détecter la langue du navigateur et l'appliquer
        const userLang = navigator.language.split('-')[0]; // 'fr-FR' -> 'fr'
        const initialLang = translations[userLang] ? userLang : 'en'; // 'en' par défaut
        setLanguage(initialLang);

        await initIndexedDB();
        const storedDb = await loadDbFromIndexedDB();
        if (storedDb && storedDb.data) {
            await initializeAppWithDb(storedDb.data, storedDb.name);
        }
    }

    start();

    // Gérer le clic sur les boutons de langue
    document.querySelectorAll('.lang-switcher button').forEach(button => {
        button.addEventListener('click', (e) => {
            setLanguage(e.target.dataset.lang);
        });
    });

}); // Fin du wrapper principal
