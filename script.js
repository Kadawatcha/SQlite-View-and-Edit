// Créez un nouveau fichier nommé script.js
const fileInput = document.getElementById('dbFile');
const tableListDiv = document.getElementById('tableList');
const tableDataDiv = document.getElementById('tableData');
const controlsDiv = document.getElementById('controls');
const saveDbButton = document.getElementById('saveDb');

let db; // Variable pour stocker l'objet base de données

// Configuration pour initialiser sql.js
const config = {
    locateFile: filename => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/${filename}`
};

// Gère le changement de fichier
fileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) {
        return;
    }

    try {
        const SQL = await initSqlJs(config);
        const fileBuffer = await file.arrayBuffer();
        db = new SQL.Database(new Uint8Array(fileBuffer));

        // Afficher la liste des tables
        displayTables();
        controlsDiv.style.display = 'block'; // Afficher le bouton de sauvegarde
    } catch (error) {
        console.error("Erreur lors du chargement de la base de données:", error);
        alert("Impossible de charger le fichier. Est-ce une base de données SQLite valide ?");
    }
});

// Affiche la liste des tables de la base de données
function displayTables() {
    tableListDiv.innerHTML = '<h2>Tables</h2>';
    tableDataDiv.innerHTML = ''; // Nettoyer les anciennes données

    try {
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';");
        if (tables.length === 0) {
            tableListDiv.innerHTML += '<p>Aucune table trouvée.</p>';
            return;
        }

        tables[0].values.forEach(tableNameArr => {
            const tableName = tableNameArr[0];
            const button = document.createElement('button');
            button.className = 'table-button';
            button.textContent = tableName;
            button.onclick = () => displayTableData(tableName);
            tableListDiv.appendChild(button);
        });
    } catch (error) {
        console.error("Erreur pour lister les tables:", error);
        alert("Une erreur est survenue lors de la lecture des tables.");
    }
}

// Affiche les données d'une table spécifique
function displayTableData(tableName) {
    tableDataDiv.innerHTML = `<h2>Contenu de la table : ${tableName}</h2>`;
    
    try {
        // Récupérer les informations sur les colonnes pour trouver la clé primaire
        const pkeyInfo = db.exec(`PRAGMA table_info(${tableName})`);
        const pkeyColumn = pkeyInfo[0].values.find(col => col[5] === 1); // col[5] is the 'pk' flag
        if (!pkeyColumn) {
            alert(`Attention : La table '${tableName}' n'a pas de clé primaire. Les modifications ne seront pas possibles.`);
        }
        const pkeyColumnName = pkeyColumn ? pkeyColumn[1] : null; // col[1] is the 'name'

        const stmt = db.prepare(`SELECT * FROM ${tableName}`);
        const table = document.createElement('table');
        const thead = document.createElement('thead');
        const tbody = document.createElement('tbody');
        
        // En-têtes
        const headerRow = document.createElement('tr');
        stmt.getColumnNames().forEach(colName => {
            const th = document.createElement('th');
            th.textContent = colName;
            headerRow.appendChild(th);
        });
        thead.appendChild(headerRow);
        
        // Lignes de données
        while (stmt.step()) {
            const row = stmt.getAsObject();
            const tr = document.createElement('tr');
            const pkeyValue = pkeyColumnName ? row[pkeyColumnName] : null;

            stmt.getColumnNames().forEach(colName => {
                const td = document.createElement('td');
                const value = row[colName];

                // Gestion des images (BLOB)
                if (value instanceof Uint8Array) {
                    try {
                        const blob = new Blob([value], { type: 'image/png' }); // Essayez avec les types d'images courants
                        const url = URL.createObjectURL(blob);
                        const img = document.createElement('img');
                        img.src = url;
                        td.appendChild(img);
                    } catch (e) {
                        td.textContent = '[BLOB]';
                    }
                } else {
                    td.textContent = value;
                }

                // Rendre éditable si ce n'est pas la clé primaire
                if (pkeyColumnName && colName !== pkeyColumnName) {
                    td.contentEditable = true;
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
        tableDataDiv.appendChild(table);

    } catch (error) {
        console.error(`Erreur pour afficher la table ${tableName}:`, error);
        alert(`Impossible d'afficher les données de la table ${tableName}.`);
    }
}

// Met à jour une cellule dans la base de données
function updateCell(tableName, colName, newValue, pkeyName, pkeyValue) {
    try {
        const stmt = db.prepare(`UPDATE ${tableName} SET ${colName} = :value WHERE ${pkeyName} = :id`);
        stmt.bind({ ':value': newValue, ':id': pkeyValue });
        stmt.step();
        stmt.free();
        console.log(`Cellule mise à jour : ${tableName}.${colName} = ${newValue}`);
    } catch (error) {
        console.error("Erreur de mise à jour:", error);
        alert("La mise à jour a échoué. Vérifiez la console pour plus de détails.");
        // Optionnel : recharger les données pour annuler le changement visuel
        displayTableData(tableName);
    }
}

// Gère le clic sur le bouton de sauvegarde
saveDbButton.addEventListener('click', () => {
    if (!db) {
        alert("Aucune base de données n'est chargée.");
        return;
    }
    try {
        const data = db.export();
        const blob = new Blob([data], { type: "application/octet-stream" });
        const a = document.createElement("a");
        document.body.appendChild(a);
        a.href = window.URL.createObjectURL(blob);
        a.download = "database_modifiee.db";
        a.style.display = "none";
        a.click();
        window.URL.revokeObjectURL(a.href);
        document.body.removeChild(a);
    } catch (error) {
        console.error("Erreur lors de la sauvegarde:", error);
        alert("Impossible de sauvegarder la base de données.");
    }
});
