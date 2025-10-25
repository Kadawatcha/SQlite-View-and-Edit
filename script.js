document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('dbFile');
    const tableListContainer = document.querySelector('#tableList .table-button-container');
    const tableDataContainer = document.querySelector('#tableData .table-responsive');
    const controlsDiv = document.getElementById('controls');
    const saveDbButton = document.getElementById('saveDb');
    const fileNameSpan = document.getElementById('fileName');

    let db;
    let currentActiveButton = null;
    let isDbModified = false;

    const config = {
        locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${filename}`
    };

    fileInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            fileNameSpan.textContent = 'Aucun fichier sélectionné';
            return;
        }
        fileNameSpan.textContent = file.name;

        try {
            const SQL = await initSqlJs(config);
            const fileBuffer = await file.arrayBuffer();
            db = new SQL.Database(new Uint8Array(fileBuffer));
            displayTables();
            controlsDiv.style.display = 'block';
            saveDbButton.disabled = true; // Désactiver le bouton au chargement
            isDbModified = false;
        } catch (error) {
            console.error("Erreur lors du chargement de la base de données:", error);
            alert("Impossible de charger le fichier. Est-ce une base de données SQLite valide ?");
        }
    });

    function displayTables() {
        tableListContainer.innerHTML = '';
        tableDataContainer.innerHTML = '<p>Sélectionnez une table pour voir son contenu.</p>';

        try {
            const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
            if (tables.length === 0 || tables[0].values.length === 0) {
                tableListContainer.innerHTML = '<p>Aucune table trouvée.</p>';
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
            console.error("Erreur pour lister les tables:", error);
            alert("Une erreur est survenue lors de la lecture des tables.");
        }
    }

    function displayTableData(tableName) {
        tableDataContainer.innerHTML = `<h2>Contenu de la table : ${tableName}</h2>`;
    
        try {
            const pkeyInfo = db.exec(`PRAGMA table_info(${tableName})`);
            const pkeyColumn = pkeyInfo[0].values.find(col => col[5] === 1);
            if (!pkeyColumn) {
                console.warn(`Attention : La table '${tableName}' n'a pas de clé primaire. Les modifications ne seront pas possibles.`);
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
                        td.textContent = value === null ? 'NULL' : value;
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
                            const newValue = e.target.textContent;
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

        } catch (error) {
            console.error(`Erreur pour afficher la table ${tableName}:`, error);
            alert(`Impossible d'afficher les données de la table ${tableName}.`);
        }
    }

    function updateCell(tableName, colName, newValue, pkeyName, pkeyValue) {
        try {
            const stmt = db.prepare(`UPDATE ${tableName} SET \`${colName}\` = :value WHERE \`${pkeyName}\` = :id`);
            stmt.bind({ ':value': newValue, ':id': pkeyValue });
            stmt.step();
            stmt.free();
            console.log(`Cellule mise à jour : ${tableName}.${colName} = ${newValue}`);
            if (!isDbModified) {
                isDbModified = true;
                saveDbButton.disabled = false; // Activer le bouton à la première modification
            }
        } catch (error) {
            console.error("Erreur de mise à jour:", error);
            alert("La mise à jour a échoué. Vérifiez la console pour plus de détails.");
            displayTableData(tableName);
        }
    }

    saveDbButton.addEventListener('click', () => {
        if (!db) {
            alert("Aucune base de données n'est chargée.");
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
            saveDbButton.disabled = true;
        } catch (error) {
            console.error("Erreur lors de la sauvegarde:", error);
            alert("Impossible de sauvegarder la base de données.");
        }
    });
});
