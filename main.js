// --- OpenLayers 地圖設定 ---

// 工廠分類顏色定義
const categoryColors = {
    '材料': 'rgba(59, 130, 246, 0.9)',    // blue-500
    '零件': 'rgba(249, 115, 22, 0.9)',  // orange-500
    '加工': 'rgba(16, 185, 129, 0.9)',  // emerald-500
    '設備': 'rgba(139, 92, 246, 0.9)',  // violet-500
    '工具': 'rgba(234, 179, 8, 0.9)',   // yellow-500
    '維修': 'rgba(239, 68, 68, 0.9)',   // red-500
    '物流': 'rgba(20, 184, 166, 0.9)',  // teal-500
    '其他': 'rgba(107, 114, 128, 0.8)', // gray-500
};
const allCategories = ['材料', '零件', '加工', '設備', '工具', '維修', '物流', '其他'];

// 聚合點顏色調色盤
const clusterColorPalette = [
    'rgba(2, 132, 199, 0.8)',   // sky-600
    'rgba(217, 70, 239, 0.8)',  // fuchsia-500
    'rgba(249, 115, 22, 0.8)',  // orange-500
    'rgba(132, 204, 22, 0.8)',  // lime-500
    'rgba(168, 85, 247, 0.8)',  // purple-500
    'rgba(239, 68, 68, 0.8)',   // red-500
];

// 建立圖示樣式快取
const styleCache = {};

const nlscLayer = new ol.layer.Tile({
    source: new ol.source.XYZ({
        url: 'https://wmts.nlsc.gov.tw/wmts/EMAP/default/GoogleMapsCompatible/{z}/{y}/{x}.png',
        attributions: '國土測繪中心',
        crossOrigin: 'anonymous'
    })
});

// 原始資料來源
const vectorSource = new ol.source.Vector();

// 聚合資料來源
const clusterSource = new ol.source.Cluster({
    distance: 50,
    minDistance: 25,
    source: vectorSource,
});

// 聚合圖層的樣式函式
function clusterStyleFunction(feature) {
    const features = feature.get('features');
    const size = features.length;
    
    if (size > 1) {
        const styleKey = `cluster_${size}`;
        if (!styleCache[styleKey]) {
            const colorIndex = (size * 5) % clusterColorPalette.length;
            const clusterColor = clusterColorPalette[colorIndex];
            styleCache[styleKey] = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 12 + Math.min(size, 20),
                    fill: new ol.style.Fill({ color: clusterColor }),
                    stroke: new ol.style.Stroke({ color: '#fff', width: 2 }),
                }),
                text: new ol.style.Text({
                    text: size.toString(),
                    fill: new ol.style.Fill({ color: '#fff' }),
                    font: 'bold 12px sans-serif',
                }),
            });
        }
        return styleCache[styleKey];
    } else {
        const originalFeature = features[0];
        const category = originalFeature.get('category');
        const singleStyleKey = `single_${category}`;
        
        // FIX: Do not cache the text part of the style
        if (!styleCache[singleStyleKey]) {
             styleCache[singleStyleKey] = new ol.style.Style({
                image: new ol.style.Circle({
                    radius: 8,
                    fill: new ol.style.Fill({ color: categoryColors[category] || categoryColors['其他'] }),
                    stroke: new ol.style.Stroke({ color: '#ffffff', width: 2 }),
                })
            });
        }

        const clonedStyle = styleCache[singleStyleKey].clone();
        const resolution = map.getView().getResolution();

        if (resolution <= 50) { // Only show text when zoomed in
            let name = originalFeature.get('name');
            if (name.length > 8) name = name.substring(0, 8) + '...';
            
            clonedStyle.setText(new ol.style.Text({
                text: name,
                font: 'bold 13px sans-serif',
                fill: new ol.style.Fill({ color: '#333' }),
                backgroundFill: new ol.style.Fill({ color: 'rgba(255, 255, 255, 0.85)' }),
                backgroundStroke: new ol.style.Stroke({ color: 'rgba(59, 130, 246, 1)', width: 1 }),
                padding: [5, 7, 5, 7],
                offsetY: 22,
                overflow: true,
            }));
        }
        return clonedStyle;
    }
}

const clusterLayer = new ol.layer.Vector({
    source: clusterSource,
    style: clusterStyleFunction,
});

// 地圖初始化
const map = new ol.Map({
    target: 'map',
    layers: [nlscLayer, clusterLayer],
    view: new ol.View({
        center: ol.proj.fromLonLat([120.9, 23.9]),
        zoom: 8 
    }),
    controls: [
        new ol.control.Zoom(),
        new ol.control.Rotate(),
        new ol.control.Attribution({ collapsible: false })
    ]
});

// --- 彈出視窗 (Popup) ---
const popupContainer = document.getElementById('popup');
const popupContent = document.getElementById('popup-content');
const popupCloser = document.getElementById('popup-closer');

const infoOverlay = new ol.Overlay({
    element: popupContainer,
    autoPan: true,
    autoPanAnimation: { duration: 250 },
});
map.addOverlay(infoOverlay);

popupCloser.onclick = function () {
    infoOverlay.setPosition(undefined);
    popupCloser.blur();
    return false;
};

// --- 使用者位置標記 ---
const userLocationElement = document.getElementById('user-location');
let userPositionCoords = null; // Store user position
const userLocationOverlay = new ol.Overlay({
    element: userLocationElement,
    positioning: 'center-center',
    stopEvent: false
});
map.addOverlay(userLocationOverlay);

map.on('singleclick', function (evt) {
    const feature = map.forEachFeatureAtPixel(evt.pixel, function (f) { return f; });
    infoOverlay.setPosition(undefined);

    if (feature) {
        const features = feature.get('features');
        if (features.length > 1) {
            const extent = ol.extent.createEmpty();
            features.forEach(f => ol.extent.extend(extent, f.getGeometry().getExtent()));
            map.getView().fit(extent, { duration: 1000, padding: [50, 50, 50, 50], maxZoom: 16 });
        } else {
            const originalFeature = features[0];
            const coordinates = originalFeature.getGeometry().getCoordinates();
            const data = originalFeature.getProperties();
            
            const view = map.getView();
            const zoom = 16;
            
            // FIX: Staged animation for better centering
            view.animate({
                center: coordinates,
                duration: 500
            }, {
                zoom: zoom,
                duration: 800
            }, () => {
                // After animations, calculate final shift
                const resolution = view.getResolutionForZoom(zoom);
                const mapSize = map.getSize();
                const verticalShift = (mapSize[1] / 4) * resolution;
                view.centerOn([coordinates[0], coordinates[1] + verticalShift], mapSize, [mapSize[0]/2, mapSize[1]/2]);
            });

            const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&destination=${data.lat},${data.lon}`;
            
            let productText = data.product || '';
            let productDisplay = productText.length > 40 ? productText.substring(0, 40) + '...' : productText;
            let showMoreBtn = productText.length > 40 ? `<button id="show-more-product" class="text-blue-500 hover:underline text-sm ml-1">顯示更多</button>` : '';

            let buttonsHtml = `
                <a href="${googleMapsUrl}" target="_blank" class="flex-1 bg-blue-600 text-white py-2 px-3 rounded-md hover:bg-blue-700 transition-colors flex items-center justify-center space-x-2 text-center text-sm">
                    <svg class="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M21.71,11.29l-9-9a1,1,0,0,0-1.42,0l-9,9a1,1,0,0,0,0,1.42l9,9a1,1,0,0,0,1.42,0l9-9A1,1,0,0,0,21.71,11.29ZM12,20.59,4.41,13,12,5.41,19.59,13Z"/></svg>
                    <span>導航</span>
                </a>`;
            if(data.phone) buttonsHtml += `<a href="tel:${data.phone}" class="flex-1 bg-gray-200 text-gray-700 py-2 px-3 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center space-x-2 text-center text-sm"><span>電話</span></a>`;
            if(data.fax) buttonsHtml += `<a href="fax:${data.fax}" class="flex-1 bg-gray-200 text-gray-700 py-2 px-3 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center space-x-2 text-center text-sm"><span>傳真</span></a>`;
            if(data.email) buttonsHtml += `<a href="mailto:${data.email}" class="flex-1 bg-gray-200 text-gray-700 py-2 px-3 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center space-x-2 text-center text-sm"><span>信箱</span></a>`;
            if(data.website) buttonsHtml += `<a href="${data.website}" target="_blank" class="flex-1 bg-gray-200 text-gray-700 py-2 px-3 rounded-md hover:bg-gray-300 transition-colors flex items-center justify-center space-x-2 text-center text-sm"><span>網頁</span></a>`;


            popupContent.innerHTML = `
                <h3 class="text-lg font-bold text-gray-800">${data.name}</h3>
                <p class="text-sm font-semibold mb-2" style="color: ${categoryColors[data.category] || categoryColors['其他']}">${data.category}</p>
                <div class="space-y-1 text-sm custom-scrollbar pr-2" style="max-height: 150px; overflow-y: auto;">
                    <p><strong>地址:</strong> ${data.address}</p>
                    <p><strong>聯絡方式:</strong> ${data.contact || '未提供'}</p>
                    <p><strong>營業時間:</strong> ${data.hours || '未提供'}</p>
                    <div><strong>公司產品:</strong> <span id="product-short-text">${productDisplay}</span> ${showMoreBtn}</div>
                </div>
                <div class="mt-4 flex items-center gap-2 flex-wrap">${buttonsHtml}</div>
            `;
            $('#product-short-text').data('fulltext', productText);
            $('#product-short-text').data('name', data.name);
            infoOverlay.setPosition(coordinates);
        }
    }
});

// --- 資料與互動邏輯 (jQuery) ---
$(document).ready(function() {
    let allFeatures = [];
    let isLoggedIn = false; // 模擬登入狀態
    const sheetId = '1MfZimoJ04URFzX2Y3F5KsFBZe6ccrH0TuSSL6letLcM';
    const sheetUrl = `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=0`;

    function showNotification(message, isError = false) {
        const $notification = $('#notification');
        $notification.text(message).removeClass('hidden');
        if (isError) {
            $notification.removeClass('bg-yellow-500 bg-blue-500').addClass('bg-red-500');
        } else {
            $notification.removeClass('bg-red-500 bg-yellow-500').addClass('bg-blue-500');
        }
        setTimeout(() => $notification.addClass('hidden'), 5000);
    }

    async function loadData() {
        showNotification('正在從 Google 試算表載入資料...', false);
        try {
            const response = await fetch(sheetUrl);
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.statusText}`);
            }
            const csvText = await response.text();
            
            Papa.parse(csvText, {
                header: true,
                skipEmptyLines: true,
                complete: function(results) {
                    const factoryData = results.data;
                    allFeatures = [];
                    factoryData.forEach((data, index) => {
                        if (data['審核'] && data['審核'].toUpperCase() === 'TRUE') {
                            const lon = parseFloat(data['經度']);
                            const lat = parseFloat(data['緯度']);
                            if (data['工廠名稱'] && !isNaN(lon) && !isNaN(lat)) {
                                const feature = new ol.Feature({
                                    geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat])),
                                    name: data['工廠名稱'],
                                    category: data['分類'] || '其他',
                                    address: data['地址'],
                                    contact: data['聯絡方式'],
                                    hours: data['營業時間'],
                                    product: data['公司產品'],
                                    phone: data['電話'],
                                    fax: data['傳真'],
                                    email: data['信箱'],
                                    website: data['網頁'],
                                    lon: lon,
                                    lat: lat
                                });
                                feature.setId(index);
                                allFeatures.push(feature);
                            }
                        }
                    });
                    vectorSource.addFeatures(allFeatures);
                    populateFiltersAndLegend();
                    $('#notification').addClass('hidden');
                },
                error: function(err) {
                     showNotification('解析試算表資料時發生錯誤！', true);
                     console.error("PapaParse Parsing Error:", err);
                }
            });

        } catch (error) {
            showNotification('無法載入 Google 試算表資料！請檢查連結是否已發佈。', true);
            console.error("Fetch Error:", error);
        }
    }

    function populateFiltersAndLegend() {
        const $categorySelect = $('#category-select, #add-category');
        const $legendContent = $('#legend-content');
        $categorySelect.html('<option value="">所有分類</option>');
        $legendContent.html('');
        
        allCategories.forEach(category => {
             if (categoryColors[category]) {
                $categorySelect.append(`<option value="${category}">${category}</option>`);
                const color = categoryColors[category];
                $legendContent.append(`
                    <div class="flex items-center">
                        <span class="h-3 w-3 rounded-full mr-1.5 border border-gray-400" style="background-color: ${color}"></span>
                        ${category}
                    </div>
                `);
             }
        });
    }
    
    // 營業時間解析與判斷
    function isCurrentlyOpen(hoursString) {
        if (!hoursString || typeof hoursString !== 'string') return false;
        
        const now = new Date();
        const currentDay = now.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
        const currentTime = now.getHours() * 100 + now.getMinutes();
        
        const dayMap = { '日': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6 };

        const parts = hoursString.split(/;|\s+/).filter(p => p);

        for (const part of parts) {
            const match = part.match(/週([一二三四五六日])-([一二三四五六日])\s*(\d{2}):(\d{2})-(\d{2}):(\d{2})|(\d{2}):(\d{2})-(\d{2}):(\d{2})/);
            if (!match) continue;

            let startDay, endDay;
            let startTime, endTime;

            if (match[1]) { // 有日期的情況
                startDay = dayMap[match[1]];
                endDay = dayMap[match[2]];
                startTime = parseInt(match[3]) * 100 + parseInt(match[4]);
                endTime = parseInt(match[5]) * 100 + parseInt(match[6]);
            } else { // 每日相同時間
                startDay = 0; endDay = 6;
                startTime = parseInt(match[7]) * 100 + parseInt(match[8]);
                endTime = parseInt(match[9]) * 100 + parseInt(match[10]);
            }
            
            if (currentDay >= startDay && currentDay <= endDay) {
                if (currentTime >= startTime && currentTime < endTime) {
                    return true;
                }
            }
        }
        return false;
    }


    function applyFilters() {
        const category = $('#category-select').val();
        const keyword = $('#keyword-search').val().toLowerCase();
        const isOpenOnly = $('#is-open-checkbox').is(':checked');
        
        vectorSource.clear();
        
        const filteredFeatures = allFeatures.filter(feature => {
            if (category && feature.get('category') !== category) return false;
            
            if (isOpenOnly && !isCurrentlyOpen(feature.get('hours'))) return false;

            if (keyword) {
                const nameMatch = feature.get('name').toLowerCase().includes(keyword);
                const addressMatch = feature.get('address').toLowerCase().includes(keyword);
                const productMatch = (feature.get('product') || '').toLowerCase().includes(keyword);
                if (!nameMatch && !addressMatch && !productMatch) return false;
            }
            
            return true;
        });
        
        vectorSource.addFeatures(filteredFeatures);
        $('#filter-modal').addClass('hidden');
    }
    
    function resetFilters() {
        $('#category-select').val('');
        $('#keyword-search').val('');
        $('#is-open-checkbox').prop('checked', false);
        vectorSource.clear();
        vectorSource.addFeatures(allFeatures);
    }

    // Modal 控制
    $('#open-filter-modal').on('click', () => $('#filter-modal').removeClass('hidden'));
    $('#close-filter-modal').on('click', () => $('#filter-modal').addClass('hidden'));
    $('#close-product-modal').on('click', () => $('#product-modal').addClass('hidden'));
    $('#close-add-location-modal').on('click', () => {
        $('#add-location-modal').addClass('hidden');
        // 移除臨時標記
        if(tempMarker) map.removeOverlay(tempMarker);
        tempMarker = null;
    });

    $('#filter-btn').on('click', applyFilters);
    $('#reset-btn').on('click', resetFilters);
    $('#center-on-me-btn').on('click', () => {
        if (userPositionCoords) {
            map.getView().animate({
                center: userPositionCoords,
                zoom: 16,
                duration: 800
            });
        } else {
            showNotification('無法定位您的位置。', true);
        }
    });

    // 顯示更多產品資訊
    $(document).on('click', '#show-more-product', function() {
        const fullText = $(this).siblings('#product-short-text').data('fulltext');
        const name = $(this).siblings('#product-short-text').data('name');
        $('#product-modal-title').text(name + ' - 公司產品');
        $('#product-modal-content').text(fullText);
        $('#product-modal').removeClass('hidden');
    });
    
    // --- 新增店家功能 ---
    let tempMarker = null;
    let tempMarkerFeature = null;

    $('#login-btn').on('click', function() {
        isLoggedIn = true;
        $(this).addClass('hidden');
        $('#add-info').removeClass('hidden');
        showNotification('已模擬登入，您現在可以新增店家。', false);
    });

    map.on('contextmenu', function(evt) {
        if (!isLoggedIn) {
            showNotification('請先登入才能新增店家！', true);
            return;
        }
        evt.preventDefault();
        
        if(tempMarker) map.removeOverlay(tempMarker);

        const coords = evt.coordinate;
        const lonLat = ol.proj.toLonLat(coords);

        const markerEl = document.createElement('div');
        markerEl.className = 'new-location-marker';
        tempMarker = new ol.Overlay({
            element: markerEl,
            position: coords,
            positioning: 'center-center',
            stopEvent: false,
        });
        map.addOverlay(tempMarker);

        // 讓標記可拖動
        let dragInteraction = new ol.interaction.Pointer({
            handleDownEvent: function(evt) {
                const feature = map.forEachFeatureAtPixel(evt.pixel, (f) => f);
                // This is a simple way to check if we are dragging the overlay
                if (tempMarker && ol.extent.containsCoordinate(tempMarker.getExtent(view.getProjection()), evt.coordinate)) {
                    return true;
                }
                return false;
            },
            handleDragEvent: function(evt) {
                tempMarker.setPosition(evt.coordinate);
            },
            handleUpEvent: function(evt) {
                const newCoords = ol.proj.toLonLat(evt.coordinate);
                reverseGeocode(newCoords[0], newCoords[1]);
            }
        });
        // map.addInteraction(dragInteraction); // This part is complex, will simplify for now

        reverseGeocode(lonLat[0], lonLat[1]);
        $('#add-location-modal').removeClass('hidden');
    });
    
    async function reverseGeocode(lon, lat) {
        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lon}&key=AIzaSyBa9P8XeaoUPUXPqMm8m6NHawZKFpCePqE`);
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                $('#add-address').val(data.results[0].formatted_address);
            } else {
                $('#add-address').val('無法自動定位地址');
            }
        } catch (error) {
            console.error('Reverse geocoding error:', error);
            $('#add-address').val('無法自動定位地址');
        }
    }
    
    async function geocode(address) {
        try {
            const response = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=AIzaSyBa9P8XeaoUPUXPqMm8m6NHawZKFpCePqE`);
            const data = await response.json();
            if (data.results && data.results.length > 0) {
                const location = data.results[0].geometry.location;
                const coords = [location.lng, location.lat];
                const mapCoords = ol.proj.fromLonLat(coords);
                if (tempMarker) {
                    tempMarker.setPosition(mapCoords);
                    map.getView().animate({ center: mapCoords, zoom: 17 });
                }
            } else {
                showNotification('找不到輸入的地址', true);
            }
        } catch (error) {
            console.error('Geocoding error:', error);
        }
    }

    $('#add-address').on('blur', function() {
        if ($(this).val()) {
            geocode($(this).val());
        }
    });


    $('#submit-location-btn').on('click', function() {
        const requiredFields = ['#add-name', '#add-category', '#add-address', '#add-contact', '#add-hours', '#add-product'];
        let isValid = true;
        requiredFields.forEach(id => {
            if (!$(id).val()) {
                $(id).addClass('border-red-500');
                isValid = false;
            } else {
                $(id).removeClass('border-red-500');
            }
        });

        if (!isValid) {
            alert('請填寫所有必填欄位 (*)');
            return;
        }
        
        const newData = {
            '工廠名稱': $('#add-name').val(),
            '分類': $('#add-category').val(),
            '地址': $('#add-address').val(),
            '聯絡方式': $('#add-contact').val(),
            '營業時間': $('#add-hours').val(),
            '公司產品': $('#add-product').val(),
            '電話': $('#add-phone').val(),
            '傳真': $('#add-fax').val(),
            '信箱': $('#add-email').val(),
            '網頁': $('#add-website').val(),
        };
        
        console.log("模擬送出資料:", newData);
        alert("資料已送出審核！感謝您的貢獻。\n（此為模擬操作，資料並未實際寫入）");
        
        $('#add-location-modal').addClass('hidden');
        $('#add-location-modal input, #add-location-modal textarea').val('');
        $('#add-location-modal select').prop('selectedIndex', 0);
    });


    // --- 地理定位邏輯 ---
    function initializeUserLocation() {
        if (!navigator.geolocation) {
            showNotification('您的瀏覽器不支援地理定位');
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userCoords = [position.coords.longitude, position.coords.latitude];
                userPositionCoords = ol.proj.fromLonLat(userCoords);
                
                map.getView().animate({
                    center: userPositionCoords,
                    zoom: 16,
                    duration: 1500
                });
                
                userLocationOverlay.setPosition(userPositionCoords);
                $('#user-location').removeClass('hidden');
            },
            (error) => {
                console.warn(`地理定位失敗: ${error.message}`);
                showNotification('無法取得您的位置，將顯示全台地圖。');
            }
        );
    }

    // --- Google Sign-In Logic ---
    window.addEventListener('google-signin-success', (e) => {
        const profile = e.detail;
        isLoggedIn = true;
        $('.g_id_signin').hide();
        $('#add-info').removeClass('hidden').addClass('flex');
        $('#user-name').text(profile.name);
        showNotification(`歡迎，${profile.name}！您現在可以新增店家。`, false);
    });

    $('#sign-out-btn').on('click', function(e) {
        e.preventDefault();
        google.accounts.id.disableAutoSelect();
        isLoggedIn = false;
        $('.g_id_signin').show();
        $('#add-info').removeClass('flex').addClass('hidden');
        showNotification('您已成功登出。');
    });


    // 初始載入
    loadData();
    initializeUserLocation();
});

</script>
</body>
</html>
