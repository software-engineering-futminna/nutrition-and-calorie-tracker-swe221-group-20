//-- JavaScript Application Logic 

        let appState = {
            user: JSON.parse(localStorage.getItem('nutriTrack_user')) || {
                name: 'John Doe',
                email: 'john@example.com',
                avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=80&q=80'
            },
            meals: JSON.parse(localStorage.getItem('nutriTrack_meals')) || [],
            goals: JSON.parse(localStorage.getItem('nutriTrack_goals')) || {
                calories: 2500,
                carbs: 300,
                protein: 100,
                fat: 70
            },
            offlineDatabase: JSON.parse(localStorage.getItem('nutriTrack_offlineDB')) || [
                { id: 'off_1', name: 'Garri (Cassava Flakes)', calories: 360, carbs: 80, protein: 1.5, fat: 0.5, source: 'Offline Preset', image: 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=120&q=80' },
                { id: 'off_2', name: 'Grilled Chicken Breast', calories: 165, carbs: 0, protein: 31, fat: 3.6, source: 'Offline Preset', image: 'https://images.unsplash.com/photo-1598515214211-89d3c73ae83b?auto=format&fit=crop&w=120&q=80' },
                { id: 'off_3', name: 'Fried Plantain (Dodo)', calories: 252, carbs: 48, protein: 1.5, fat: 7.2, source: 'Offline Preset', image: 'https://images.unsplash.com/photo-1528825871115-3581a5387919?auto=format&fit=crop&w=120&q=80' }
            ],
            history: JSON.parse(localStorage.getItem('nutriTrack_history')) || [
                { date: '2026-05-09', calories: 2150, mealsCount: 4 },
                { date: '2026-05-08', calories: 2400, mealsCount: 5 }
            ],
            activeView: 'dashboard',
            selectedProduct: null,
            searchResults: []
        };

        // DOM Loaded Initialization
        document.addEventListener('DOMContentLoaded', () => {
            lucide.createIcons();
            initNavigation();
            updateDateDisplay();
            syncUserProfile();
            renderDashboard();
            renderDailyLog();
            renderGoals();
            renderOfflineLibrary();
            renderHistoryView();
            setupEventListeners();
            registerServiceWorker();
            initInstallExperience();
            applyViewFromURL();
        });

        function showToast(message, type = 'success') {
            const container = document.getElementById('toastContainer');
            const toast = document.createElement('div');
            const bgClass = type === 'error' ? '#dc2626' : '#047857';
            toast.className = 'toast';
            toast.style.backgroundColor = bgClass;
            toast.innerHTML = `<i data-lucide="${type === 'error' ? 'alert-circle' : 'check-circle'}" style="width:16px; height:16px;"></i> ${message}`;
            container.appendChild(toast);
            lucide.createIcons();

            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                toast.style.transition = 'all 0.3s ease';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        function switchView(viewId) {
            appState.activeView = viewId;
            document.querySelectorAll('.page-view').forEach(view => view.classList.remove('active'));

            const target = document.getElementById(`view-${viewId}`);
            if (target) {
                target.classList.add('active');
            }

            document.querySelectorAll('#desktopNav .nav-item').forEach(item => {
                const isActive = item.getAttribute('data-view') === viewId;
                item.classList.toggle('active', isActive);
            });

            document.querySelectorAll('#mobileNav .mobile-nav-item').forEach(item => {
                const isActive = item.getAttribute('data-view') === viewId;
                item.classList.toggle('active', isActive);
            });

            lucide.createIcons();
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }

        function initNavigation() {
            document.querySelectorAll('#desktopNav .nav-item, #mobileNav .mobile-nav-item').forEach(btn => {
                btn.addEventListener('click', () => {
                    const view = btn.getAttribute('data-view');
                    if (view) switchView(view);
                });
            });
        }

        function updateDateDisplay() {
            const options = { month: 'short', day: 'numeric', year: 'numeric', weekday: 'long' };
            const dateStr = new Date().toLocaleDateString('en-US', options);
            const dateEl = document.getElementById('currentDateDisplay');
            if (dateEl) dateEl.textContent = dateStr.replace(',', ' •');
        }

        async function executeSearch(query) {
            if (!query) return;

            const loader = document.getElementById('apiLoader');
            if (loader) loader.style.display = 'block';

            try {
                const localMatches = appState.offlineDatabase.filter(item =>
                    item.name.toLowerCase().includes(query.toLowerCase())
                );

                const response = await fetch(
                    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=12`
                );
                const data = await response.json();
                
                const remoteProducts = (data.products || []).map(prod => formatOpenFoodProduct(prod));
                appState.searchResults = [...localMatches, ...remoteProducts];

                document.getElementById('searchKeywordLabel').textContent = query;
                document.getElementById('resultsCountLabel').textContent = `${appState.searchResults.length} items found`;

                renderSearchResultsList();
                switchView('results');
            } catch (err) {
                appState.searchResults = appState.offlineDatabase.filter(item =>
                    item.name.toLowerCase().includes(query.toLowerCase())
                );
                document.getElementById('searchKeywordLabel').textContent = `${query} (Offline Mode)`;
                document.getElementById('resultsCountLabel').textContent = `${appState.searchResults.length} offline items found`;
                renderSearchResultsList();
                switchView('results');
                showToast('Using local offline food database', 'error');
            } finally {
                if (loader) loader.style.display = 'none';
            }
        }

        async function lookupBarcode(barcode) {
            showToast(`Querying barcode: ${barcode}...`);
            try {
                const response = await fetch(`https://world.openfoodfacts.org/api/v0/product/${barcode}.json`);
                const data = await response.json();

                if (data.status === 1 && data.product) {
                    const formatted = formatOpenFoodProduct(data.product);
                    appState.searchResults = [formatted];
                    saveToOfflineDatabase(formatted);
                    showProductDetails(0);
                    showToast('Product found & saved for offline!');
                } else {
                    showToast('Barcode not found in global database. Creating template...', 'error');
                    const fallback = {
                        name: `Product #${barcode}`,
                        calories: 150, carbs: 20, protein: 5, fat: 2, sugar: 1, fiber: 1,
                        image: 'https://images.unsplash.com/photo-1610348725531-843dff14a9da?auto=format&fit=crop&w=300&q=80',
                        brand: 'Custom Scan'
                    };
                    appState.searchResults = [fallback];
                    showProductDetails(0);
                }
            } catch (err) {
                const offlineMatch = appState.offlineDatabase.find(i => i.id === barcode || i.name.includes(barcode));
                if (offlineMatch) {
                    appState.searchResults = [offlineMatch];
                    showProductDetails(0);
                } else {
                    showToast('Unable to reach Open Food Facts server.', 'error');
                }
            }
        }

        function formatOpenFoodProduct(prod) {
            const nuts = prod.nutriments || {};
            return {
                id: prod.code || Date.now().toString(),
                name: prod.product_name || 'Unknown Food Item',
                calories: Math.round(nuts['energy-kcal_100g'] || nuts['energy-kcal'] || 0),
                carbs: parseFloat(nuts['carbohydrates_100g'] || 0).toFixed(1),
                protein: parseFloat(nuts['proteins_100g'] || 0).toFixed(1),
                fat: parseFloat(nuts['fat_100g'] || 0).toFixed(1),
                sugar: parseFloat(nuts['sugars_100g'] || 0).toFixed(1),
                fiber: parseFloat(nuts['fiber_100g'] || 0).toFixed(1),
                image: prod.image_front_thumb_url || prod.image_front_url || 'https://images.unsplash.com/photo-1610348725531-843dff14a9da?auto=format&fit=crop&w=300&q=80',
                brand: prod.brands || 'Open Food Facts'
            };
        }

        function quickSearch(term) {
            document.getElementById('searchInput').value = term;
            executeSearch(term);
        }

        function quickBarcode(code) {
            document.getElementById('barcodeInput').value = code;
            lookupBarcode(code);
        }

        function toggleSimulatedScan() {
            const status = document.getElementById('scanStatusText');
            status.textContent = 'Scanning barcode...';
            status.style.color = '#34d399';
            
            setTimeout(() => {
                const sampleBarcodes = ['737628064502', '3017620422003', '5000159461122'];
                const randomCode = sampleBarcodes[Math.floor(Math.random() * sampleBarcodes.length)];
                status.textContent = `Barcode Captured: ${randomCode}`;
                document.getElementById('barcodeInput').value = randomCode;
                lookupBarcode(randomCode);
            }, 1200);
        }

        function renderSearchResultsList() {
            const container = document.getElementById('searchResultsList');
            container.innerHTML = '';

            if (appState.searchResults.length === 0) {
                container.innerHTML = `
                    <div class="card" style="text-align:center; padding:32px;">
                        <i data-lucide="search-x" style="width:40px; height:40px; color:var(--text-subtle); margin-bottom:8px;"></i>
                        <p style="font-size:0.875rem; font-weight:700;">No matching food items found</p>
                        <p style="font-size:0.75rem; color:var(--text-subtle); margin-top:4px;">Try another search keyword or create a custom food item.</p>
                    </div>
                `;
                lucide.createIcons();
                return;
            }

            appState.searchResults.forEach((prod, index) => {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.cssText = 'padding:16px; display:flex; align-items:center; justify-content:space-between; cursor:pointer;';
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${prod.image}" alt="${prod.name}" style="width:48px; height:48px; border-radius:8px; object-fit:cover; border:1px solid var(--border-subtle);" onerror="this.src='https://placehold.co/80x80?text=Food'">
                        <div>
                            <p style="font-weight:700; font-size:0.875rem;">${prod.name}</p>
                            <p style="font-size:0.75rem; color:var(--text-subtle);">${prod.brand || 'Food Item'} • Per 100g</p>
                        </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <span style="font-size:0.875rem; font-weight:900; color:var(--primary-dark);">${prod.calories} kcal</span>
                        <i data-lucide="chevron-right" style="width:16px; height:16px; color:var(--text-subtle);"></i>
                    </div>
                `;
                card.addEventListener('click', () => showProductDetails(index));
                container.appendChild(card);
            });

            lucide.createIcons();
        }

        function showProductDetails(index) {
            const prod = appState.searchResults[index];
            if (!prod) return;

            appState.selectedProduct = prod;

            document.getElementById('detailImg').src = prod.image;
            document.getElementById('detailTitle').textContent = prod.name;
            document.getElementById('detailBrand').textContent = prod.brand || 'Nutrition Database';
            document.getElementById('detailCalories').textContent = prod.calories;

            document.getElementById('tileCal').textContent = `${prod.calories} kcal`;
            document.getElementById('tileCarbs').textContent = `${prod.carbs} g`;
            document.getElementById('tileProtein').textContent = `${prod.protein} g`;
            document.getElementById('tileFat').textContent = `${prod.fat} g`;
            document.getElementById('tileSugar').textContent = `${prod.sugar || 0} g`;
            document.getElementById('tileFiber').textContent = `${prod.fiber || 0} g`;

            document.getElementById('detailServingGrams').value = 100;

            switchView('details');
        }

        function saveToOfflineDatabase(product) {
            const exists = appState.offlineDatabase.some(p => p.name.toLowerCase() === product.name.toLowerCase());
            if (!exists) {
                appState.offlineDatabase.unshift({
                    id: product.id || Date.now().toString(),
                    name: product.name,
                    calories: product.calories,
                    carbs: product.carbs,
                    protein: product.protein,
                    fat: product.fat,
                    image: product.image,
                    source: 'User Saved'
                });
                saveState();
                renderOfflineLibrary();
            }
        }

        function saveCurrentProductOffline() {
            if (!appState.selectedProduct) return;
            saveToOfflineDatabase(appState.selectedProduct);
            showToast(`${appState.selectedProduct.name} saved for offline searching!`);
        }

        function renderOfflineLibrary() {
            const container = document.getElementById('offlineLibraryGrid');
            const searchVal = (document.getElementById('offlineSearchInput')?.value || '').toLowerCase();
            
            const countBadges = document.querySelectorAll('#offlineCountBadge, #mobileOfflineCount, #settingCacheCount');
            countBadges.forEach(el => {
                if (el) el.textContent = appState.offlineDatabase.length;
            });

            if (!container) return;
            container.innerHTML = '';

            const filtered = appState.offlineDatabase.filter(item => item.name.toLowerCase().includes(searchVal));

            if (filtered.length === 0) {
                container.innerHTML = `
                    <div class="card" style="grid-column: 1 / -1; text-align:center; padding:32px;">
                        <p style="font-size:0.875rem; font-weight:700;">No offline items found</p>
                        <p style="font-size:0.75rem; color:var(--text-subtle); margin-top:4px;">Items searched or added will automatically save here.</p>
                    </div>
                `;
                return;
            }

            filtered.forEach(item => {
                const card = document.createElement('div');
                card.className = 'card';
                card.style.cssText = 'padding:16px; display:flex; align-items:center; justify-content:space-between;';
                card.innerHTML = `
                    <div style="display:flex; align-items:center; gap:12px;">
                        <img src="${item.image}" style="width:40px; height:40px; border-radius:8px; object-fit:cover;" onerror="this.src='https://placehold.co/80x80?text=Food'">
                        <div>
                            <p style="font-size:0.75rem; font-weight:700;">${item.name}</p>
                            <p style="font-size:0.625rem; color:var(--text-subtle);">${item.calories} kcal/100g • ${item.protein}g Protein</p>
                        </div>
                    </div>
                    <button class="btn btn-secondary" style="padding:6px 10px; font-size:0.75rem;">
                        + Log
                    </button>
                `;
                card.querySelector('button').addEventListener('click', () => {
                    appState.selectedProduct = item;
                    addSelectedItemToLog();
                });
                container.appendChild(card);
            });
        }

        function addSelectedItemToLog() {
            if (!appState.selectedProduct) return;

            const serving = parseFloat(document.getElementById('detailServingGrams')?.value || 100);
            const ratio = serving / 100;

            const mealItem = {
                id: Date.now(),
                name: appState.selectedProduct.name,
                serving: serving,
                calories: Math.round(appState.selectedProduct.calories * ratio),
                carbs: parseFloat((appState.selectedProduct.carbs * ratio).toFixed(1)),
                protein: parseFloat((appState.selectedProduct.protein * ratio).toFixed(1)),
                fat: parseFloat((appState.selectedProduct.fat * ratio).toFixed(1)),
                image: appState.selectedProduct.image
            };

            appState.meals.unshift(mealItem);
            saveToOfflineDatabase(appState.selectedProduct);

            saveState();
            renderDashboard();
            renderDailyLog();
            showToast(`${mealItem.name} added to daily log!`);
            switchView('log');
        }

        function renderDashboard() {
            const totals = calculateTotals();
            const calGoal = appState.goals.calories;
            const calPct = Math.min(Math.round((totals.calories / calGoal) * 100), 100);

            document.getElementById('dashCalories').textContent = totals.calories;
            document.getElementById('dashCalorieGoal').textContent = calGoal;
            document.getElementById('dashCaloriePct').textContent = calPct;

            const ringFill = document.getElementById('calorieRingFill');
            if (ringFill) {
                const offset = 427 - (427 * calPct) / 100;
                ringFill.style.strokeDashoffset = offset;
            }

            updateMacroBar('dashCarbs', totals.carbs, appState.goals.carbs);
            updateMacroBar('dashProtein', totals.protein, appState.goals.protein);
            updateMacroBar('dashFat', totals.fat, appState.goals.fat);

            const recentGrid = document.getElementById('recentFoodsGrid');
            if (!recentGrid) return;
            recentGrid.innerHTML = '';

            if (appState.meals.length === 0) {
                recentGrid.innerHTML = `<p style="font-size:0.75rem; color:var(--text-subtle); grid-column:1/-1; padding:16px; text-align:center;">No meals logged today yet.</p>`;
                return;
            }

            appState.meals.slice(0, 5).forEach(meal => {
                const tile = document.createElement('div');
                tile.style.cssText = 'background:#f8fafc; padding:12px; border-radius:12px; border:1px solid var(--border-subtle); text-align:center;';
                tile.innerHTML = `
                    <img src="${meal.image}" alt="${meal.name}" style="width:40px; height:40px; border-radius:8px; object-fit:cover; margin:0 auto 4px auto;" onerror="this.src='https://placehold.co/80x80?text=Food'">
                    <p style="font-size:0.75rem; font-weight:700; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${meal.name}</p>
                    <p style="font-size:0.625rem; font-weight:700; color:var(--primary-dark);">${meal.calories} kcal</p>
                `;
                recentGrid.appendChild(tile);
            });
        }

        function updateMacroBar(prefix, val, goal) {
            const valEl = document.getElementById(`${prefix}Val`);
            const goalEl = document.getElementById(`${prefix}Goal`);
            const barEl = document.getElementById(`${prefix}Bar`);

            if (valEl) valEl.textContent = Math.round(val);
            if (goalEl) goalEl.textContent = goal;
            if (barEl) {
                const pct = Math.min((val / goal) * 100, 100);
                barEl.style.width = `${pct}%`;
            }
        }

        function renderDailyLog() {
            const totals = calculateTotals();
            const remaining = Math.max(appState.goals.calories - totals.calories, 0);

            document.getElementById('logTotalConsumed').textContent = `${totals.calories} kcal`;
            document.getElementById('logDailyGoal').textContent = `${appState.goals.calories} kcal`;
            document.getElementById('logRemaining').textContent = `${remaining} kcal`;
            document.getElementById('tableTotalCalories').textContent = `${totals.calories} kcal`;

            const tbody = document.getElementById('mealTableBody');
            if (!tbody) return;
            tbody.innerHTML = '';

            if (appState.meals.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="padding:32px; text-align:center; font-size:0.75rem; color:var(--text-subtle);">No foods logged for today.</td></tr>`;
                return;
            }

            appState.meals.forEach(meal => {
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td style="font-weight:700;">${meal.name}</td>
                    <td style="color:var(--text-muted);">${meal.serving} g</td>
                    <td style="font-weight:700; color:var(--primary-dark);">${meal.calories} kcal</td>
                    <td style="text-align:right;">
                        <button onclick="deleteMeal(${meal.id})" style="background:none; border:none; color:#dc2626; font-size:0.75rem; font-weight:700; cursor:pointer;">Remove</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        }

        function deleteMeal(id) {
            appState.meals = appState.meals.filter(m => m.id !== id);
            saveState();
            renderDashboard();
            renderDailyLog();
            showToast('Meal item removed');
        }

        function renderGoals() {
            document.getElementById('goalCalorieDisplay').textContent = appState.goals.calories;
            document.getElementById('goalCarbsDisplay').textContent = appState.goals.carbs;
            document.getElementById('goalProteinDisplay').textContent = appState.goals.protein;
            document.getElementById('goalFatDisplay').textContent = appState.goals.fat;

            const totals = calculateTotals();
            const pct = Math.min(Math.round((totals.calories / appState.goals.calories) * 100), 100);

            document.getElementById('overallGoalPct').textContent = pct;
            document.getElementById('overallGoalProgressBar').style.width = `${pct}%`;
        }

        function renderHistoryView() {
            const listContainer = document.getElementById('historyListContainer');
            const graphContainer = document.getElementById('historyBarGraph');

            if (listContainer) {
                listContainer.innerHTML = '';
                appState.history.forEach(item => {
                    const el = document.createElement('div');
                    el.style.cssText = 'display:flex; justify-content:space-between; align-items:center; padding:12px; background:#f8fafc; border-radius:12px; font-size:0.75rem; font-weight:600;';
                    el.innerHTML = `
                        <div style="display:flex; align-items:center; gap:8px;">
                            <i data-lucide="calendar" style="width:16px; height:16px; color:var(--text-subtle);"></i>
                            <span>${item.date}</span>
                        </div>
                        <span style="color:#047857; font-weight:800;">${item.calories} kcal (${item.mealsCount || 3} meals)</span>
                    `;
                    listContainer.appendChild(el);
                });
            }

            if (graphContainer) {
                graphContainer.innerHTML = '';
                const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                days.forEach((day, index) => {
                    const mockVal = [1800, 2100, 2400, 1950, 2300, 2500, 2150][index];
                    const pct = Math.min((mockVal / 2500) * 100, 100);
                    
                    const barBox = document.createElement('div');
                    barBox.style.cssText = 'flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; height:100%; justify-content:flex-end;';
                    barBox.innerHTML = `
                        <div style="width:100%; background:#10b981; border-radius:6px 6px 0 0; height:${pct}%;" title="${mockVal} kcal"></div>
                        <span style="font-size:0.625rem; font-weight:700; color:var(--text-subtle);">${day}</span>
                    `;
                    graphContainer.appendChild(barBox);
                });
            }

            document.getElementById('historyLogCount').textContent = appState.history.length;
            document.getElementById('historyAvgCal').textContent = '2210 kcal';
            lucide.createIcons();
        }

        function syncUserProfile() {
            document.getElementById('sidebarUserName').textContent = appState.user.name;
            document.getElementById('sidebarUserEmail').textContent = appState.user.email;
            document.getElementById('sidebarAvatar').src = appState.user.avatar;
            document.getElementById('dashWelcomeName').textContent = appState.user.name.split(' ')[0];

            document.getElementById('settingNameInput').value = appState.user.name;
            document.getElementById('settingEmailInput').value = appState.user.email;
            document.getElementById('settingAvatarInput').value = appState.user.avatar;
        }

        function calculateTotals() {
            return appState.meals.reduce((acc, m) => {
                acc.calories += Number(m.calories || 0);
                acc.carbs += Number(m.carbs || 0);
                acc.protein += Number(m.protein || 0);
                acc.fat += Number(m.fat || 0);
                return acc;
            }, { calories: 0, carbs: 0, protein: 0, fat: 0 });
        }

        function saveState() {
            localStorage.setItem('nutriTrack_user', JSON.stringify(appState.user));
            localStorage.setItem('nutriTrack_meals', JSON.stringify(appState.meals));
            localStorage.setItem('nutriTrack_goals', JSON.stringify(appState.goals));
            localStorage.setItem('nutriTrack_offlineDB', JSON.stringify(appState.offlineDatabase));
            localStorage.setItem('nutriTrack_history', JSON.stringify(appState.history));
        }

        function clearOfflineCache() {
            appState.offlineDatabase = [];
            saveState();
            renderOfflineLibrary();
            showToast('Offline food cache cleared');
        }

        function clearAllHistoryData() {
            appState.history = [];
            saveState();
            renderHistoryView();
            showToast('History logs cleared');
        }

        function resetAppDefaults() {
            localStorage.clear();
            location.reload();
        }

        function openCreateCustomFoodModal() {
            document.getElementById('customFoodModal').classList.add('open');
        }

        function closeCustomFoodModal() {
            document.getElementById('customFoodModal').classList.remove('open');
        }

        function setupEventListeners() {
            document.getElementById('searchForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const query = document.getElementById('searchInput').value.trim();
                executeSearch(query);
            });

            document.getElementById('barcodeForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const code = document.getElementById('barcodeInput').value.trim();
                lookupBarcode(code);
            });

            document.getElementById('addToLogBtn').addEventListener('click', addSelectedItemToLog);

            const goalsModal = document.getElementById('goalsModal');
            document.getElementById('editGoalsBtn').addEventListener('click', () => {
                document.getElementById('inputGoalCalories').value = appState.goals.calories;
                document.getElementById('inputGoalCarbs').value = appState.goals.carbs;
                document.getElementById('inputGoalProtein').value = appState.goals.protein;
                document.getElementById('inputGoalFat').value = appState.goals.fat;
                goalsModal.classList.add('open');
            });

            document.getElementById('cancelGoalsBtn').addEventListener('click', () => {
                goalsModal.classList.remove('open');
            });

            document.getElementById('goalsForm').addEventListener('submit', (e) => {
                e.preventDefault();
                appState.goals = {
                    calories: parseInt(document.getElementById('inputGoalCalories').value) || 2500,
                    carbs: parseInt(document.getElementById('inputGoalCarbs').value) || 300,
                    protein: parseInt(document.getElementById('inputGoalProtein').value) || 100,
                    fat: parseInt(document.getElementById('inputGoalFat').value) || 70
                };
                saveState();
                renderDashboard();
                renderDailyLog();
                renderGoals();
                goalsModal.classList.remove('open');
                showToast('Nutrition targets updated!');
            });

            document.getElementById('clearLogBtn').addEventListener('click', () => {
                appState.meals = [];
                saveState();
                renderDashboard();
                renderDailyLog();
                showToast('Daily log reset');
            });

            document.getElementById('profileForm').addEventListener('submit', (e) => {
                e.preventDefault();
                appState.user = {
                    name: document.getElementById('settingNameInput').value,
                    email: document.getElementById('settingEmailInput').value,
                    avatar: document.getElementById('settingAvatarInput').value
                };
                saveState();
                syncUserProfile();
                showToast('Profile settings saved!');
            });

            document.getElementById('customFoodForm').addEventListener('submit', (e) => {
                e.preventDefault();
                const customItem = {
                    id: `custom_${Date.now()}`,
                    name: document.getElementById('cfName').value,
                    calories: parseInt(document.getElementById('cfCal').value) || 0,
                    carbs: parseFloat(document.getElementById('cfCarbs').value) || 0,
                    protein: parseFloat(document.getElementById('cfProtein').value) || 0,
                    fat: parseFloat(document.getElementById('cfFat').value) || 0,
                    image: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=120&q=80',
                    source: 'Custom Created'
                };
                appState.offlineDatabase.unshift(customItem);
                saveState();
                renderOfflineLibrary();
                closeCustomFoodModal();
                showToast(`${customItem.name} saved to offline library!`);
            });
        }

        // =====================================================
        // PWA: Service Worker, Install Experience & Deep Linking
        // =====================================================

        let deferredInstallPrompt = null;

        function isStandaloneDisplay() {
            return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        }

        function isIOSDevice() {
            return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
        }

        function registerServiceWorker() {
            if (!('serviceWorker' in navigator)) return;

            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').then((registration) => {
                    registration.addEventListener('updatefound', () => {
                        const newWorker = registration.installing;
                        if (!newWorker) return;
                        newWorker.addEventListener('statechange', () => {
                            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                showToast('Update ready — refresh anytime for the latest version');
                            }
                        });
                    });
                }).catch((err) => {
                    console.warn('Service worker registration failed:', err);
                });
            });
        }

        function setInstallButtonsVisible(visible) {
            document.querySelectorAll('.js-install-btn').forEach((btn) => {
                btn.classList.toggle('hidden', !visible);
            });
        }

        function openIOSInstallModal() {
            document.getElementById('iosInstallModal').classList.add('open');
            lucide.createIcons();
        }

        function closeIOSInstallModal() {
            document.getElementById('iosInstallModal').classList.remove('open');
        }

        function handleInstallClick() {
            if (deferredInstallPrompt) {
                deferredInstallPrompt.prompt();
                deferredInstallPrompt.userChoice.then((choice) => {
                    deferredInstallPrompt = null;
                    setInstallButtonsVisible(false);
                    if (choice.outcome === 'accepted') {
                        showToast('NutriFlow installed! Find it on your home screen.');
                    }
                });
                return;
            }

            if (isIOSDevice()) {
                openIOSInstallModal();
                return;
            }

            showToast("Install isn't available in this browser yet", 'error');
        }

        function initInstallExperience() {
            if (isStandaloneDisplay()) {
                const note = document.getElementById('alreadyInstalledNote');
                if (note) note.classList.remove('hidden');
                return;
            }

            document.querySelectorAll('.js-install-btn').forEach((btn) => {
                btn.addEventListener('click', handleInstallClick);
            });

            if (isIOSDevice()) {
                setInstallButtonsVisible(true);
                const hint = document.getElementById('iosInstallHint');
                if (hint) hint.classList.remove('hidden');
            }

            window.addEventListener('beforeinstallprompt', (event) => {
                event.preventDefault();
                deferredInstallPrompt = event;
                setInstallButtonsVisible(true);
            });

            window.addEventListener('appinstalled', () => {
                deferredInstallPrompt = null;
                setInstallButtonsVisible(false);
                showToast('NutriFlow installed! Find it on your home screen.');
            });
        }

        // Lets home-screen shortcuts (Search / Scan / Log) land directly on that view
        function applyViewFromURL() {
            const params = new URLSearchParams(window.location.search);
            const requestedView = params.get('view');
            const validViews = ['dashboard', 'search', 'barcode', 'offline', 'log', 'goals', 'history', 'settings', 'about'];

            if (requestedView && validViews.includes(requestedView)) {
                switchView(requestedView);
                window.history.replaceState(null, '', 'index.html');
            }
        }