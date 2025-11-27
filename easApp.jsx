import React, { useState, useEffect, useRef } from 'react';
import { Camera, Coins, Calculator, RotateCcw, Settings, Zap, Brain, BookOpen, X, Link as LinkIcon, RefreshCw, Database, Filter, ArrowUpDown, TrendingUp, DollarSign, Utensils, Plus, Minus, Trash2, Edit2, Save, Check, LayoutDashboard, History as HistoryIcon, UtensilsCrossed, Droplets, Clock, ChevronRight, PenTool, Search, Timer, Cpu, Activity } from 'lucide-react';

// --- 1. 設定與資料 ---
const PRESET_SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQ57HSiS9fzVpSA6rEhhWJNMhgsxJce-wq0_qBSXx3AYdngzJGUlqszgqgfjdyt3gBYApXZewmhWudc/pub?gid=0&single=true&output=csv";

const DEFAULT_SETTINGS = {
  lunchPrice: 1380,
  dinnerPrice: 1580,
  calorieGoal: 2500,
  liquidGoal: 4, // 杯
};

const CATEGORY_MAP = {
  'Sashimi': '現切刺身', 'Sushi': '壽司手卷', 'Kobachi': '懷石小缽', 'Yakimono': '職人烤物',
  'Agemono': '炸物天婦羅', 'Soup': '湯品/鍋物', 'Steamed Dish': '蒸物', 'Cooked Dish': '熱菜/鐵板',
  'Drink': '飲品酒水', 'Dessert': '精緻甜點'
};

const DEFAULT_MENU_DB = [
  { category: 'Sashimi', name: '鮭魚 (Salmon)', price: 70, restaurantPrice: 120, calories: 55, desc: '現點現切的基本魚種' },
  { category: 'Sashimi', name: '紅魽 (Amberjack)', price: 80, restaurantPrice: 150, calories: 45, desc: '配合時令供應的魚種' },
  { category: 'Sushi', name: '炙燒干貝握壽司', price: 100, restaurantPrice: 180, calories: 45, desc: '生食級干貝，鮮甜' },
  { category: 'Yakimono', name: '香魚姿燒', price: 180, restaurantPrice: 280, calories: 220, desc: '串波技法，NAGOMI 必吃' },
  { category: 'Agemono', name: '廣島炸牡蠣', price: 100, restaurantPrice: 160, calories: 140, desc: '爆漿鮮味，必搶' },
  { category: 'Drink', name: '三得利頂級生啤', price: 180, restaurantPrice: 250, calories: 140, desc: '無限暢飲，神級泡沫' },
];

// --- Helper Functions ---
const parseCSVLine = (line) => {
  const rowData = [];
  let field = '';
  let insideQuote = false;
  for (let c = 0; c < line.length; c++) {
    const char = line[c];
    if (char === '"') {
      if (c + 1 < line.length && line[c + 1] === '"') { field += '"'; c++; } else { insideQuote = !insideQuote; }
    } else if (char === ',' && !insideQuote) { rowData.push(field); field = ''; } else { field += char; }
  }
  rowData.push(field);
  return rowData;
};

const parseCSV = (csvText) => {
  const lines = csvText.split(/\r?\n/);
  const result = [];
  if (lines.length === 0) return result;
  const headerLine = lines[0].trim();
  const headers = parseCSVLine(headerLine).map(h => h.trim().toLowerCase());
  const colMap = {
    category: headers.findIndex(h => h.includes('category') || h.includes('分類')),
    name: headers.findIndex(h => h.includes('name') || h.includes('品名')),
    price: headers.findIndex(h => (h.includes('price') || h.includes('市價')) && !h.includes('restaurant') && !h.includes('hotel') && !h.includes('定價')),
    restaurantPrice: headers.findIndex(h => h.includes('restaurant') || h.includes('定價') || h.includes('飯店') || h.includes('hotel')),
    calories: headers.findIndex(h => h.includes('calor') || h.includes('熱量')),
    desc: headers.findIndex(h => h.includes('desc') || h.includes('描述'))
  };
  if (colMap.category === -1) { colMap.category = 0; colMap.name = 1; colMap.price = 2; colMap.calories = 3; colMap.desc = 4; colMap.restaurantPrice = 5; }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const rowData = parseCSVLine(line);
    if (rowData.length > 2) {
      const price = Number(rowData[colMap.price]?.trim());
      const restaurantPrice = Number(rowData[colMap.restaurantPrice]?.trim());
      result.push({
        category: rowData[colMap.category]?.trim() || '',
        name: rowData[colMap.name]?.trim() || '',
        price: !isNaN(price) ? price : 0,
        restaurantPrice: !isNaN(restaurantPrice) ? restaurantPrice : 0,
        calories: Number(rowData[colMap.calories]?.trim()) || 0,
        desc: rowData[colMap.desc]?.trim() || ''
      });
    }
  }
  return result;
};

const generateSystemPrompt = (menuDB) => {
  const menuString = menuDB.map(item => `- ${item.name}: ~$${item.price > 0 ? item.price : Math.round(item.restaurantPrice/1.5)}`).join('\n');
  return `Context: User is eating at NAGOMI Buffet. Goal: Identify food, count items, estimate value.
DB:
${menuString}
Instructions:
1. Identify items.
2. ESTIMATE COUNT (e.g., 3 slices). Default 1.
3. Return JSON: { items: [{name, price, calories, count}], comment }`;
};

// --- Components ---

const ProgressBar = ({ current, total, colorClass, label, unit = '', icon: Icon }) => {
  const rawPercentage = total > 0 ? (current / total) * 100 : 0;
  const displayPercentage = Math.round(rawPercentage);
  const visualWidth = Math.min(100, Math.max(0, rawPercentage));
  const isOver = rawPercentage >= 100;
  const isSuperOver = rawPercentage >= 200; 

  return (
    <div className={`p-4 rounded-xl border transition-colors duration-500 ${isSuperOver ? 'bg-red-900/20 border-red-500/30' : 'bg-stone-900/50 border-stone-800'}`}>
      <div className="flex justify-between items-end mb-2">
        <div className="flex items-center gap-2 text-stone-400 text-xs font-medium uppercase tracking-wider font-mono">
          {Icon && <Icon size={14} className={isOver ? 'text-amber-400 animate-pulse' : ''} />}
          {label}
        </div>
        <div className="text-right">
          <div className="flex items-baseline justify-end gap-1">
             <span className={`text-lg font-black transition-colors font-mono ${isOver ? 'text-amber-400' : 'text-stone-200'}`}>
               {current.toLocaleString()}
             </span>
             <span className="text-xs text-stone-500 font-mono"> / {total.toLocaleString()}{unit}</span>
          </div>
        </div>
      </div>
      <div className="h-2.5 w-full bg-stone-800 rounded-full overflow-hidden relative">
        <div className={`h-full rounded-full transition-all duration-1000 ${colorClass} ${isOver ? 'shadow-[0_0_12px_currentColor] brightness-110' : ''}`} style={{ width: `${visualWidth}%` }}></div>
        {isOver && <div className="absolute inset-0 bg-white/20 animate-pulse"></div>}
      </div>
      <div className="flex justify-between items-center mt-1.5">
         <span className={`text-[10px] font-medium ${isSuperOver ? 'text-red-400' : isOver ? 'text-amber-500' : 'text-stone-500'}`}>
           {isSuperOver ? '🔥 Boost Mode: 200%+' : isOver ? '🎉 Performance Max!' : 'Load Balancing...'}
         </span>
         <div className={`text-xs font-bold flex items-center gap-1 font-mono ${isOver ? 'text-amber-400' : 'text-stone-400'}`}>
           {displayPercentage}%
           {isOver && <TrendingUp size={12} />}
         </div>
      </div>
    </div>
  );
};

const TimeRemaining = () => {
  const [timeLeft, setTimeLeft] = useState('');
  const [session, setSession] = useState('');
  const [progress, setProgress] = useState(0); 
  const [isUrgent, setIsUrgent] = useState(false);

  useEffect(() => {
    const updateTimer = () => {
      const now = new Date();
      const currentHour = now.getHours();
      const currentMin = now.getMinutes();
      const currentTime = currentHour * 60 + currentMin;

      const lunchStart = 11 * 60 + 30; // 690
      const lunchEnd = 15 * 60;        // 900
      const dinnerStart = 17 * 60 + 30;// 1050
      const dinnerEnd = 21 * 60 + 30;  // 1290

      let start = 0;
      let end = 0;
      let currentSession = 'IDLE';

      if (currentTime >= lunchStart && currentTime < lunchEnd) {
        start = lunchStart;
        end = lunchEnd;
        currentSession = 'LUNCH_SESSION';
      } else if (currentTime >= dinnerStart && currentTime < dinnerEnd) {
        start = dinnerStart;
        end = dinnerEnd;
        currentSession = 'DINNER_SESSION';
      } else {
        setSession('SYSTEM_IDLE');
        setTimeLeft('--:--');
        setProgress(0);
        return;
      }

      setSession(currentSession);
      
      const totalDuration = end - start;
      const elapsed = currentTime - start;
      const remaining = end - currentTime;
      
      const percentUsed = Math.min(100, Math.max(0, (elapsed / totalDuration) * 100));
      setProgress(percentUsed);

      const h = Math.floor(remaining / 60);
      const m = remaining % 60;
      setTimeLeft(`${h}h ${m}m`);
      
      setIsUrgent(remaining <= 30);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 60000);
    return () => clearInterval(interval);
  }, []);

  let progressColor = 'bg-emerald-500';
  if (progress > 50) progressColor = 'bg-yellow-500';
  if (progress > 85) progressColor = 'bg-red-500 animate-pulse';

  return (
    <div className={`p-4 rounded-xl border flex flex-col justify-between shadow-lg transition-colors ${isUrgent ? 'bg-red-950/30 border-red-500/50' : 'bg-gradient-to-br from-stone-800 to-stone-900 border-stone-700'}`}>
      <div className="flex justify-between items-center mb-3">
        <div>
          <div className={`text-xs font-bold uppercase tracking-wider mb-1 font-mono ${isUrgent ? 'text-red-400' : 'text-stone-400'}`}>
            <span className="text-[10px] bg-stone-950 px-1 py-0.5 rounded border border-stone-700 mr-1">GOV</span>
            {session}
          </div>
          <div className={`text-3xl font-black font-mono tracking-tight ${isUrgent ? 'text-red-400' : 'text-stone-200'}`}>{timeLeft}</div>
        </div>
        <div className={`p-2 rounded-full ${isUrgent ? 'bg-red-500/20 text-red-400 animate-bounce' : 'bg-stone-800 text-stone-500'}`}>
           {isUrgent ? <Timer size={24} /> : <Clock size={24} />}
        </div>
      </div>
      
      <div className="w-full">
        <div className="flex justify-between text-[10px] text-stone-500 mb-1 font-mono">
           <span>UPTIME: {Math.round(progress)}%</span>
           <span>REMAINING</span>
        </div>
        <div className="h-1.5 w-full bg-stone-950 rounded-full overflow-hidden">
           <div className={`h-full rounded-full transition-all duration-1000 ${progressColor}`} style={{ width: `${progress}%` }}></div>
        </div>
      </div>
    </div>
  );
};

// --- Main App ---
const NagomiApp = () => {
  const [activeTab, setActiveTab] = useState('dashboard'); 
  const [history, setHistory] = useState([]); 
  
  const [apiKey, setApiKey] = useState('');
  const [sheetUrl, setSheetUrl] = useState(PRESET_SHEET_URL);
  const [menuDB, setMenuDB] = useState(DEFAULT_MENU_DB);
  const [priceMode, setPriceMode] = useState('market');
  const [userSettings, setUserSettings] = useState(DEFAULT_SETTINGS);
  
  const [showSettings, setShowSettings] = useState(false);
  const [showMenuGuide, setShowMenuGuide] = useState(false);
  const [isUsingSheet, setIsUsingSheet] = useState(false);
  
  const [image, setImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [plateItems, setPlateItems] = useState([]);
  const [aiComment, setAiComment] = useState("");
  const [isEditing, setIsEditing] = useState(false); 
  const fileInputRef = useRef(null);

  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(null);
  const [suggestions, setSuggestions] = useState([]);

  const [guideTab, setGuideTab] = useState('category');
  const [guideCategory, setGuideCategory] = useState('All');
  const [guideSort, setGuideSort] = useState('cp_desc');
  const [excludeLowCal, setExcludeLowCal] = useState(true);
  const [sortBy, setSortBy] = useState('cp_desc');

  useEffect(() => {
    const storedKey = localStorage.getItem('gemini_api_key');
    const storedSettings = localStorage.getItem('nagomi_user_settings');
    const storedHistory = localStorage.getItem('nagomi_history');
    const storedSheetUrl = localStorage.getItem('nagomi_sheet_url');
    const storedPriceMode = localStorage.getItem('nagomi_price_mode');

    if (storedKey) setApiKey(storedKey); else setShowSettings(true);
    if (storedSettings) setUserSettings(JSON.parse(storedSettings));
    if (storedHistory) setHistory(JSON.parse(storedHistory));
    if (storedPriceMode) setPriceMode(storedPriceMode);
    
    const targetUrl = storedSheetUrl || PRESET_SHEET_URL;
    setSheetUrl(targetUrl);
    if (targetUrl) fetchSheetData(targetUrl);
  }, []);

  useEffect(() => {
    localStorage.setItem('nagomi_history', JSON.stringify(history));
  }, [history]);

  const fetchSheetData = async (url) => {
    if (!url) return;
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error('Network error');
      const text = await response.text();
      const parsedData = parseCSV(text);
      if (parsedData.length > 0) {
        setMenuDB(parsedData);
        setIsUsingSheet(true);
      }
    } catch (error) {
      console.error("Sheet error", error);
      setIsUsingSheet(false);
      setMenuDB(DEFAULT_MENU_DB);
    }
  };

  const saveGlobalSettings = () => {
    localStorage.setItem('gemini_api_key', apiKey.trim());
    localStorage.setItem('nagomi_sheet_url', sheetUrl);
    localStorage.setItem('nagomi_user_settings', JSON.stringify(userSettings));
    if (sheetUrl) fetchSheetData(sheetUrl);
    setShowSettings(false);
  };

  const getDisplayPrice = (item) => {
    if (priceMode === 'restaurant') {
      return item.restaurantPrice > 0 ? item.restaurantPrice : Math.round(item.price * 1.5);
    }
    return item.price > 0 ? item.price : Math.round(item.restaurantPrice / 1.5);
  };

  const calculateTotal = (items) => {
    return items.reduce((acc, item) => {
      const dbItem = menuDB.find(db => db.name === item.name) || item; 
      const unitPrice = getDisplayPrice(dbItem.price !== undefined ? dbItem : item); 
      const cals = dbItem.calories || item.calories || 0;
      
      return {
        price: acc.price + (unitPrice * (item.count || 1)),
        calories: acc.calories + (cals * (item.count || 1)),
        liquids: acc.liquids + (item.category === 'Drink' || item.name.includes('酒') || item.name.includes('茶') || item.name.includes('飲') ? (item.count || 1) : 0)
      };
    }, { price: 0, calories: 0, liquids: 0 });
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => { 
        setImage(reader.result); 
        setPlateItems([]); 
        setIsEditing(false);
        setActiveTab('scan');
      };
      reader.readAsDataURL(file);
    }
  };

  const startManualInput = () => {
    setPlateItems([{ name: '', price: 0, calories: 0, count: 1, category: 'General' }]);
    setAiComment("Manual Input Mode - Kernel Override");
    setImage(null);
    setIsEditing(true);
  };

  const analyzeImage = async () => {
    if (!apiKey) { alert("請先設定 API Key"); setShowSettings(true); return; }
    setLoading(true);
    try {
      const base64Image = image.split(',')[1];
      const payload = {
        contents: [{
            parts: [{ text: generateSystemPrompt(menuDB) }, { text: "Analyze image. Return JSON: { items: [{name, price, calories, count}], comment }" }, { inline_data: { mime_type: "image/jpeg", data: base64Image } }]
        }],
        generationConfig: { response_mime_type: "application/json" }
      };
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey.trim()}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message);
      const res = JSON.parse(data.candidates[0].content.parts[0].text);
      
      const enhancedItems = res.items.map(i => {
        const dbMatch = menuDB.find(d => d.name.includes(i.name) || i.name.includes(d.name));
        return {
          ...i,
          category: dbMatch?.category || 'General',
          price: dbMatch?.price || i.price,
          restaurantPrice: dbMatch?.restaurantPrice || 0,
          calories: dbMatch?.calories || i.calories,
          count: i.count || 1
        };
      });

      setPlateItems(enhancedItems);
      setAiComment(res.comment);
      setIsEditing(true);
    } catch (e) { alert("Error: " + e.message); } finally { setLoading(false); }
  };

  const confirmPlate = () => {
    if (plateItems.length === 0) return;
    const validItems = plateItems.filter(i => i.name.trim() !== '');
    if (validItems.length === 0) return;

    const newHistory = [...history, ...validItems];
    setHistory(newHistory);
    setPlateItems([]);
    setImage(null);
    setIsEditing(false);
    setActiveTab('dashboard');
  };

  const handleNameChange = (index, val) => {
    const newItems = [...plateItems];
    newItems[index].name = val;
    setPlateItems(newItems);

    if (val.trim()) {
      const matches = menuDB.filter(db => 
        db.name.toLowerCase().includes(val.toLowerCase())
      ).slice(0, 6); 
      setSuggestions(matches);
      setActiveSuggestionIndex(index);
    } else {
      setSuggestions([]);
      setActiveSuggestionIndex(null);
    }
  };

  const selectSuggestion = (index, dbItem) => {
    const newItems = [...plateItems];
    newItems[index] = {
      ...newItems[index],
      name: dbItem.name,
      price: dbItem.price,
      restaurantPrice: dbItem.restaurantPrice,
      calories: dbItem.calories,
      category: dbItem.category
    };
    setPlateItems(newItems);
    setActiveSuggestionIndex(null);
    setSuggestions([]);
  };

  const updateCount = (index, delta) => {
    setPlateItems(prev => prev.map((item, i) => {
      if (i === index) {
        const newCount = Math.max(0, (item.count || 1) + delta);
        return { ...item, count: newCount };
      }
      return item;
    }).filter(item => item.count > 0));
  };

  const addNewItem = () => {
    setPlateItems(prev => [...prev, { name: '', price: 0, calories: 0, count: 1, category: 'General' }]);
  };

  const updateItemField = (index, field, value) => {
    setPlateItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const totals = plateItems.reduce((acc, item) => {
    let unitPrice = item.price;
    if (priceMode === 'restaurant') {
       const dbItem = menuDB.find(db => db.name === item.name || item.name.includes(db.name));
       if (dbItem && dbItem.restaurantPrice > 0) {
         unitPrice = dbItem.restaurantPrice;
       } else {
         unitPrice = Math.round(item.price * 1.5); 
       }
    } else {
       const dbItem = menuDB.find(db => db.name === item.name || item.name.includes(db.name));
       if (item.price === 0 && dbItem && dbItem.restaurantPrice > 0) {
           unitPrice = Math.round(dbItem.restaurantPrice / 1.5);
       }
    }

    return {
      price: acc.price + (unitPrice * item.count),
      calories: acc.calories + (item.calories * item.count)
    };
  }, { price: 0, calories: 0 });

  const paybackScore = Math.min(10, Math.floor(totals.price / 150)); 

  const processGuideItems = (items) => {
    let processed = items.map(item => {
      const displayPrice = getDisplayPrice(item);
      return {
        ...item,
        displayPrice: displayPrice,
        cp: item.calories > 0 ? (displayPrice / item.calories).toFixed(2) : 0
      };
    });
    if (excludeLowCal && activeTab === 'ranking') processed = processed.filter(item => item.calories > 5);
    if (activeTab === 'ranking') processed = processed.filter(item => item.displayPrice > 0);
    return processed.sort((a, b) => {
        if (sortBy === 'cp_desc') return b.cp - a.cp;
        if (sortBy === 'price_desc') return b.displayPrice - a.displayPrice;
        if (sortBy === 'cal_asc') return a.calories - b.calories;
        return 0;
    });
  };

  const uniqueCategories = ['All', ...new Set(menuDB.map(item => item.category))];

  const renderDashboard = () => {
    const totalStats = calculateTotal(history);
    const hour = new Date().getHours();
    const isLunch = hour >= 11 && hour < 16;
    const budget = isLunch ? userSettings.lunchPrice : userSettings.dinnerPrice;
    
    return (
      <div className="space-y-4 animate-fade-in pb-24">
        <TimeRemaining />
        <div className="grid grid-cols-2 gap-3">
           <div className="bg-stone-900 border border-stone-800 p-4 rounded-xl">
              <div className="text-xs text-stone-500 mb-1 flex items-center gap-1"><DollarSign size={10}/> VALUE_TOTAL</div>
              <div className="text-3xl font-black text-amber-400 font-mono">${totalStats.price.toLocaleString()}</div>
           </div>
           <div className="bg-stone-900 border border-stone-800 p-4 rounded-xl">
              <div className="text-xs text-stone-500 mb-1 flex items-center gap-1"><Database size={10}/> ITEM_COUNT</div>
              <div className="text-3xl font-black text-stone-200 font-mono">{history.reduce((a,b)=>a+(b.count||1),0)}</div>
           </div>
        </div>
        <h3 className="text-stone-400 text-[10px] font-bold uppercase tracking-widest mt-4 px-1 font-mono">KERNEL METRICS</h3>
        <ProgressBar current={totalStats.price} total={budget} label="ROI STATUS" unit=" NTD" colorClass="bg-gradient-to-r from-amber-600 to-yellow-500" icon={Activity}/>
        <ProgressBar current={totalStats.calories} total={userSettings.calorieGoal} label="THERMAL LOAD" unit=" kcal" colorClass="bg-gradient-to-r from-green-600 to-emerald-400" icon={Zap}/>
        <ProgressBar current={totalStats.liquids} total={userSettings.liquidGoal} label="FLUID LEVEL" unit=" cups" colorClass="bg-gradient-to-r from-blue-600 to-cyan-400" icon={Droplets}/>
        <div className="mt-6 p-4 bg-stone-900 rounded-xl border border-stone-800">
           <h4 className="text-stone-300 font-bold mb-2 text-xs font-mono uppercase text-amber-500">// GOVERNOR LOG</h4>
           <p className="text-xs text-stone-500 leading-relaxed font-mono">
             {totalStats.price < budget ? "> Budget deficit detected. Recommend scaling up high-value intake (e.g., Scallops, Ayu)." : "> Target ROI achieved. System performing optimally. Dessert partition mounted."}
             {totalStats.calories > userSettings.calorieGoal * 0.8 && " [WARN] Thermal throttling imminent. Avoid carbohydrates."}
           </p>
        </div>
      </div>
    );
  };

  const renderHistory = () => (
    <div className="animate-fade-in pb-24">
      <h3 className="text-xl font-bold text-stone-200 mb-4 px-2 font-mono">/var/log/history</h3>
      {history.length === 0 ? (
        <div className="text-center text-stone-500 py-20 font-mono text-sm">No logs found.<br/>Initiate intake sequence.</div>
      ) : (
        <div className="bg-stone-900 rounded-2xl border border-stone-800 overflow-hidden">
          <div className="divide-y divide-stone-800">
            {history.map((item, idx) => (
              <div key={idx} className="p-4 flex justify-between items-center">
                <div>
                  <div className="text-stone-200 font-bold text-sm">{item.name}</div>
                  <div className="text-stone-500 text-xs flex gap-2 font-mono"><span>x{item.count}</span><span>{item.calories * item.count} kcal</span></div>
                </div>
                <div className="text-amber-400 font-mono font-bold">${getDisplayPrice(item) * item.count}</div>
              </div>
            ))}
            <div className="p-4 bg-stone-950 flex justify-between items-center text-stone-400 text-sm font-bold border-t border-stone-800">
               <span className="font-mono">TOTAL_SUM</span>
               <span className="font-mono text-white">${calculateTotal(history).price}</span>
            </div>
          </div>
          <button onClick={() => {if(confirm("Flush logs?")) setHistory([])}} className="w-full p-4 text-xs text-red-500 hover:bg-stone-950/50 border-t border-stone-800 font-mono">FLUSH_LOGS</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 font-sans selection:bg-amber-900">
      <div className="bg-stone-950 p-4 border-b border-stone-800 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="bg-amber-600 p-2 rounded-lg"><Cpu size={20} className="text-white" /></div>
          <div>
            <h1 className="font-bold text-lg tracking-wide text-amber-50">NAGOMI PowerHAL</h1>
            <p className="text-[10px] text-amber-500/80 uppercase tracking-widest font-mono">EAS (Eat Aware Scheduler)</p>
          </div>
        </div>
        <div className="flex gap-2 items-center">
           <button onClick={() => {
             const newMode = priceMode === 'market' ? 'restaurant' : 'market';
             setPriceMode(newMode);
             localStorage.setItem('nagomi_price_mode', newMode);
           }} className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] font-bold border transition-all ${priceMode === 'restaurant' ? 'bg-amber-900/30 border-amber-600 text-amber-500' : 'bg-stone-800 border-stone-700 text-stone-400'}`}>
             {priceMode === 'restaurant' ? <Utensils size={12} /> : <DollarSign size={12} />}
             {priceMode === 'restaurant' ? 'HOTEL' : 'MARKET'}
           </button>
           <button onClick={() => setShowMenuGuide(true)} className="p-2 text-stone-400 hover:text-amber-400"><BookOpen size={20} /></button>
           <button onClick={() => setShowSettings(true)} className="p-2 text-stone-400 hover:text-amber-400"><Settings size={20} /></button>
        </div>
      </div>

      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-stone-900 border border-stone-700 p-6 rounded-2xl w-full max-w-sm space-y-4">
            <div className="flex justify-between items-center"><h3 className="font-bold text-amber-50">Config</h3><button onClick={() => setShowSettings(false)}><X size={20} className="text-stone-500"/></button></div>
            <div className="space-y-3 text-sm">
              <div><label className="text-stone-400 block mb-1 font-mono">API_KEY</label><input type="password" className="w-full bg-stone-950 border-stone-800 rounded p-2 font-mono" value={apiKey} onChange={e=>setApiKey(e.target.value)}/></div>
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-stone-400 block mb-1 font-mono">LUNCH_BUDGET</label><input type="number" className="w-full bg-stone-950 border-stone-800 rounded p-2 font-mono" value={userSettings.lunchPrice} onChange={e=>setUserSettings({...userSettings, lunchPrice: Number(e.target.value)})}/></div>
                <div><label className="text-stone-400 block mb-1 font-mono">DINNER_BUDGET</label><input type="number" className="w-full bg-stone-950 border-stone-800 rounded p-2 font-mono" value={userSettings.dinnerPrice} onChange={e=>setUserSettings({...userSettings, dinnerPrice: Number(e.target.value)})}/></div>
              </div>
              <div><label className="text-stone-400 block mb-1 font-mono">THERMAL_LIMIT (kcal)</label><input type="number" className="w-full bg-stone-950 border-stone-800 rounded p-2 font-mono" value={userSettings.calorieGoal} onChange={e=>setUserSettings({...userSettings, calorieGoal: Number(e.target.value)})}/></div>
              <div><label className="text-stone-400 block mb-1 font-mono">FLUID_TARGET (cups)</label><input type="number" className="w-full bg-stone-950 border-stone-800 rounded p-2 font-mono" value={userSettings.liquidGoal} onChange={e=>setUserSettings({...userSettings, liquidGoal: Number(e.target.value)})}/></div>
            </div>
            <button onClick={saveGlobalSettings} className="w-full bg-amber-600 text-white py-3 rounded-xl font-bold font-mono">APPLY_CONFIG</button>
          </div>
        </div>
      )}

      {showMenuGuide && (
        <div className="fixed inset-0 bg-stone-950 z-50 overflow-y-auto flex flex-col animate-fade-in">
           <div className="sticky top-0 bg-stone-900/95 backdrop-blur border-b border-stone-800 p-4 z-10 space-y-3">
              <div className="flex justify-between items-center">
                 <div>
                    <h2 className="text-xl font-bold text-amber-50">Database</h2>
                    <div className="flex items-center gap-2 text-xs text-stone-400">
                      <span>{isUsingSheet ? "SYNC: CLOUD" : "SYNC: LOCAL"}</span>
                      {isUsingSheet && <button onClick={() => fetchSheetData(sheetUrl)} className="p-1 bg-stone-800 rounded hover:bg-stone-700"><RefreshCw size={12} /></button>}
                    </div>
                 </div>
                 <button onClick={() => setShowMenuGuide(false)} className="p-2 bg-stone-800 rounded-full text-stone-400"><X size={20}/></button>
              </div>
              
              <div className="flex items-center justify-between bg-stone-800 p-1 rounded-lg">
                   <button onClick={() => setPriceMode('market')} className={`flex-1 py-1.5 text-xs rounded-md transition-all flex items-center justify-center gap-1 ${priceMode === 'market' ? 'bg-stone-600 text-white' : 'text-stone-400'}`}>
                     <DollarSign size={12} /> MARKET
                   </button>
                   <button onClick={() => setPriceMode('restaurant')} className={`flex-1 py-1.5 text-xs rounded-md transition-all flex items-center justify-center gap-1 ${priceMode === 'restaurant' ? 'bg-amber-700 text-white' : 'text-stone-400'}`}>
                     <Utensils size={12} /> HOTEL
                   </button>
              </div>

              <div className="flex p-1 bg-stone-800 rounded-xl">
                <button onClick={() => setActiveTab('category')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${activeTab === 'category' ? 'bg-stone-700 text-white shadow' : 'text-stone-400 hover:text-stone-200'}`}>Category</button>
                <button onClick={() => setActiveTab('ranking')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all flex items-center justify-center gap-1 ${activeTab === 'ranking' ? 'bg-amber-700 text-white shadow' : 'text-stone-400 hover:text-stone-200'}`}><TrendingUp size={14} /> Ranking</button>
              </div>
              {activeTab === 'category' && (
                <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                  {uniqueCategories.map(cat => (
                    <button key={cat} onClick={() => setGuideCategory(cat)} className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-bold border transition-colors ${guideCategory === cat ? 'bg-amber-600 border-amber-600 text-white' : 'bg-stone-900 border-stone-700 text-stone-400 hover:border-stone-500'}`}>{CATEGORY_MAP[cat] || (cat === 'All' ? 'ALL' : cat)}</button>
                  ))}
                </div>
              )}
              <div className="flex justify-between items-center pt-2 border-t border-stone-800">
                 <div className="flex bg-stone-800 rounded-lg p-0.5">
                    <button onClick={() => setSortBy('cp_desc')} className={`px-2 py-1 text-[10px] rounded-md ${sortBy === 'cp_desc' ? 'bg-amber-600 text-white' : 'text-stone-400'}`}>CP_MAX</button>
                    <button onClick={() => setSortBy('price_desc')} className={`px-2 py-1 text-[10px] rounded-md ${sortBy === 'price_desc' ? 'bg-stone-600 text-white' : 'text-stone-400'}`}>PRICE_MAX</button>
                    <button onClick={() => setSortBy('cal_asc')} className={`px-2 py-1 text-[10px] rounded-md ${sortBy === 'cal_asc' ? 'bg-stone-600 text-white' : 'text-stone-400'}`}>LOW_CAL</button>
                 </div>
                 {activeTab === 'ranking' && <label className="flex items-center gap-1 text-[10px] text-stone-400"><input type="checkbox" checked={excludeLowCal} onChange={(e) => setExcludeLowCal(e.target.checked)} className="accent-amber-600"/> No Tea</label>}
              </div>
           </div>
           <div className="flex-1 p-4 pb-20 overflow-y-auto">
              {activeTab === 'category' ? (
                <div className="space-y-6">
                  {uniqueCategories.filter(cat => guideCategory === 'All' || guideCategory === cat).filter(cat => cat !== 'All').map(category => {
                      const items = processGuideItems(menuDB.filter(i => i.category === category));
                      return (
                        <div key={category} className="animate-fade-in">
                          <h3 className="text-amber-500 font-bold mb-3 uppercase text-sm tracking-wider border-b border-stone-800 pb-1 sticky top-0 bg-stone-950/90 backdrop-blur py-1 z-0 font-mono">{CATEGORY_MAP[category] || category}</h3>
                          <div className="grid gap-3">
                            {items.map((item, idx) => (
                              <div key={idx} className="bg-stone-900 border border-stone-800 rounded-xl p-3 flex justify-between items-start">
                                 <div className="flex-1 pr-2"><div className="font-bold text-stone-200 text-sm">{item.name.split('(')[0]}</div><div className="text-xs text-stone-500 mt-1">{item.desc}</div></div>
                                 <div className="text-right shrink-0"><div className="text-amber-400 font-mono font-bold text-sm">${item.displayPrice}</div><div className="text-stone-600 text-xs font-mono">{item.calories} kcal</div></div>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                  })}
                </div>
              ) : (
                <div className="grid gap-2 animate-fade-in">
                  {processGuideItems(menuDB).map((item, idx) => (
                    <div key={idx} className="bg-stone-900 border border-stone-800 rounded-xl p-3 flex items-center gap-3">
                       <div className="w-8 h-8 flex items-center justify-center bg-stone-800 rounded-full font-bold text-stone-500 text-xs font-mono">#{idx + 1}</div>
                       <div className="flex-1">
                         <div className="font-bold text-stone-200 text-sm">{item.name.split('(')[0]}</div>
                         <div className="flex items-center gap-2 mt-1"><span className="text-[10px] bg-amber-900/30 text-amber-500 px-1.5 py-0.5 rounded border border-amber-900/50 font-mono">${item.cp}/kcal</span><span className="text-xs text-stone-500">{item.desc}</span></div>
                       </div>
                       <div className="text-right"><div className="text-stone-300 font-mono text-sm">${item.displayPrice}</div><div className="text-stone-600 text-xs font-mono">{item.calories} kcal</div></div>
                    </div>
                  ))}
                </div>
              )}
           </div>
        </div>
      )}

      <div className="max-w-md mx-auto p-4">
        {activeTab === 'dashboard' && renderDashboard()}
        
        {activeTab === 'scan' && (
          <>
            {!image && !isEditing && (
              <div className="flex flex-col items-center justify-center h-[60vh] space-y-6">
                <button onClick={() => fileInputRef.current.click()} className="w-48 h-48 rounded-full bg-stone-900 border-4 border-stone-800 flex flex-col items-center justify-center hover:border-amber-600 transition-all shadow-2xl group">
                  <Camera size={48} className="text-stone-400 mb-2 group-hover:text-amber-400 transition-colors" /><span className="text-stone-400 font-medium group-hover:text-amber-400 transition-colors">SCAN_PLATE</span>
                </button>
                <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
                <button onClick={startManualInput} className="flex items-center gap-2 text-stone-400 hover:text-amber-400 px-6 py-3 rounded-xl border border-stone-800 hover:bg-stone-900 transition-all font-mono"><PenTool size={18} /><span className="font-medium">MANUAL_INPUT</span></button>
              </div>
            )}

            {image && !isEditing && !loading && (
              <div className="space-y-6 animate-fade-in">
                <div className="relative rounded-2xl overflow-hidden shadow-lg border border-stone-800 group">
                   <img src={image} alt="Food" className="w-full max-h-64 object-cover" />
                   <button onClick={() => setImage(null)} className="absolute top-2 right-2 bg-black/50 p-2 rounded-full text-white"><RotateCcw size={16}/></button>
                </div>
                <button onClick={analyzeImage} className="w-full py-4 rounded-xl font-bold text-lg bg-amber-600 text-white shadow-lg flex items-center justify-center gap-2 font-mono">
                  <Calculator size={20} /> EXECUTE_ANALYSIS
                </button>
              </div>
            )}

            {loading && (
              <div className="flex flex-col items-center justify-center h-[50vh] space-y-4">
                 <div className="w-12 h-12 border-4 border-stone-800 border-t-amber-600 rounded-full animate-spin"></div>
                 <p className="text-stone-400 animate-pulse font-mono">Processing Neural Networks...</p>
              </div>
            )}

            {isEditing && (
              <div className="space-y-4 pb-24 animate-fade-in">
                {image ? (
                  <div className="relative h-32 rounded-xl overflow-hidden border border-stone-800">
                     <img src={image} className="w-full h-full object-cover opacity-60" />
                     <div className="absolute inset-0 flex items-center justify-center"><span className="bg-black/60 text-white px-3 py-1 rounded-full text-xs backdrop-blur font-mono">EST_VALUE: ${calculateTotal(plateItems).price}</span></div>
                  </div>
                ) : (
                  <div className="p-4 bg-stone-800 rounded-xl border border-stone-700 text-center mb-2 font-mono">
                    <p className="text-stone-300 font-bold">MANUAL_OVERRIDE</p>
                    <p className="text-xs text-stone-500 mt-1">TOTAL: ${calculateTotal(plateItems).price}</p>
                  </div>
                )}
                
                <div className="bg-stone-900 rounded-xl border border-stone-800 divide-y divide-stone-800">
                  {plateItems.map((item, idx) => (
                    <div key={idx} className="relative p-3 flex items-center gap-3">
                      <div className="flex-1 relative">
                        <input 
                          className="bg-transparent text-stone-200 font-bold text-sm w-full placeholder-stone-600 focus:outline-none focus:border-b border-amber-600" 
                          value={item.name} 
                          placeholder="Search Item..."
                          onChange={(e) => handleNameChange(idx, e.target.value)}
                          onFocus={() => handleNameChange(idx, item.name)} 
                        />
                        <div className="text-xs text-stone-500 mt-1 font-mono">${getDisplayPrice(item)} x {item.count}</div>
                        
                        {activeSuggestionIndex === idx && suggestions.length > 0 && (
                          <div className="absolute top-full left-0 w-full bg-stone-800 border border-stone-700 rounded-lg shadow-2xl z-50 max-h-48 overflow-y-auto mt-1">
                            {suggestions.map((s, sIdx) => (
                              <button 
                                key={sIdx}
                                className="w-full text-left p-3 text-xs hover:bg-stone-700 border-b border-stone-700/50 last:border-0 flex justify-between items-center"
                                onMouseDown={(e) => {
                                  e.preventDefault(); 
                                  selectSuggestion(idx, s);
                                }}
                              >
                                <div className="font-bold text-stone-200">{s.name}</div>
                                <div className="text-right">
                                  <div className="text-amber-400 font-mono">${getDisplayPrice(s)}</div>
                                  <div className="text-stone-500 text-[10px] font-mono">{s.calories} kcal</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center bg-stone-800 rounded-lg border border-stone-700">
                        <button onClick={() => updateCount(idx, -1)} className="p-2 text-stone-400 hover:text-red-400 hover:bg-red-900/20 rounded-l-lg"><Minus size={14}/></button>
                        <span className="w-6 text-center font-mono text-stone-200 text-sm">{item.count}</span>
                        <button onClick={() => updateCount(idx, 1)} className="p-2 text-stone-400 hover:text-green-400 hover:bg-green-900/20 rounded-r-lg"><Plus size={14}/></button>
                      </div>
                    </div>
                  ))}
                  <button onClick={() => setPlateItems([...plateItems, {name: '', price: 0, count: 1, calories: 0, category: 'General'}])} className="w-full p-3 text-xs text-stone-400 hover:bg-stone-800 flex items-center justify-center gap-1 font-mono"><Plus size={12}/> ADD_ITEM</button>
                </div>

                <div className="flex gap-3">
                  <button onClick={() => {setImage(null); setIsEditing(false); setPlateItems([])}} className="flex-1 py-3 rounded-xl border border-stone-700 text-stone-400 text-sm font-mono">DISCARD</button>
                  <button onClick={confirmPlate} className="flex-[2] py-3 rounded-xl bg-green-600 text-white font-bold shadow-lg shadow-green-900/20 flex items-center justify-center gap-2 font-mono"><Check size={18} /> COMMIT</button>
                </div>
              </div>
            )}
          </>
        )}

        {activeTab === 'history' && renderHistory()}
      </div>

      <div className="fixed bottom-0 inset-x-0 bg-stone-950/90 backdrop-blur border-t border-stone-800 p-2 flex justify-around z-40 pb-safe">
        <button onClick={() => setActiveTab('dashboard')} className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'dashboard' ? 'text-amber-500' : 'text-stone-500 hover:text-stone-300'}`}><LayoutDashboard size={24} /><span className="text-[10px] font-bold mt-1 font-mono">SYSFS</span></button>
        <button onClick={() => setActiveTab('scan')} className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'scan' ? 'text-amber-500' : 'text-stone-500 hover:text-stone-300'}`}><Camera size={24} /><span className="text-[10px] font-bold mt-1 font-mono">INPUT</span></button>
        <button onClick={() => setActiveTab('history')} className={`flex flex-col items-center p-2 rounded-xl transition-colors ${activeTab === 'history' ? 'text-amber-500' : 'text-stone-500 hover:text-stone-300'}`}><HistoryIcon size={24} /><span className="text-[10px] font-bold mt-1 font-mono">DMESG</span></button>
      </div>

      <style>{`
        @keyframes fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fade-in 0.3s ease-out forwards; }
        .pb-safe { padding-bottom: env(safe-area-inset-bottom); }
      `}</style>
    </div>
  );
};

export default NagomiApp;
