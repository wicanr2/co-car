
<html lang="zh-TW">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>力行國泰接駁車預約系統</title>
    <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const { useState, useMemo, useEffect } = React;

        // --- 1. 登入畫面元件 (採用海報微黏土風格) ---
        const LoginScreen = ({ onLogin }) => {
            const [userId, setUserId] = useState('');
            const [userName, setUserName] = useState('');

            const handleSubmit = (e) => {
                e.preventDefault();
                if (userId && userName) {
                    onLogin({ userId, userName });
                }
            };

            return (
                <div className="min-h-screen flex items-center justify-center bg-[#e6f4ea] bg-gradient-to-br from-[#e0f2f1] via-[#e8f5e9] to-[#b2ebf2] p-4 relative overflow-hidden">
                    {/* 裝飾性背景元素，呼應海報的陽光與溫暖色調 */}
                    <div className="absolute top-10 left-10 w-40 h-40 bg-yellow-200/60 rounded-full mix-blend-multiply filter blur-2xl animate-pulse"></div>
                    <div className="absolute bottom-10 right-10 w-56 h-56 bg-teal-200/60 rounded-full mix-blend-multiply filter blur-2xl"></div>
                    <div className="absolute top-1/2 left-1/4 w-32 h-32 bg-orange-100/60 rounded-full mix-blend-multiply filter blur-2xl"></div>

                    {/* 登入卡片：加大圓角、柔和陰影，營造微黏土風格 */}
                    <div className="max-w-md w-full bg-white/90 backdrop-blur-md rounded-[2.5rem] shadow-[0_20px_50px_-12px_rgba(20,184,166,0.3)] p-8 sm:p-10 relative z-10 border border-white/80">
                        <div className="text-center mb-8">
                            {/* 車輛圖示：改用薄荷綠色系與圓潤外框 */}
                            <div className="w-20 h-20 bg-gradient-to-tr from-teal-100 to-emerald-50 text-teal-500 rounded-[1.5rem] flex items-center justify-center mx-auto mb-5 text-4xl shadow-inner transform -rotate-3 hover:rotate-0 transition duration-300">
                                🚐
                            </div>
                            <h2 className="text-3xl font-extrabold text-teal-800 tracking-tight mb-3">夏季專屬接駁車</h2>
                            <span className="text-teal-700 mt-2 font-medium bg-teal-50/80 inline-block px-5 py-1.5 rounded-full text-sm shadow-sm border border-teal-100">
                                告別酷暑 ☀️ 高效通勤新體驗
                            </span>
                        </div>

                        {/* 登入表單 */}
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div>
                                <label className="block text-sm font-bold text-teal-800 mb-2 ml-1">工號</label>
                                <input 
                                    type="text" 
                                    value={userId}
                                    onChange={(e) => setUserId(e.target.value)}
                                    className="w-full px-5 py-3.5 bg-teal-50/50 border-2 border-teal-100 rounded-2xl focus:ring-0 focus:border-teal-400 outline-none transition text-teal-900 placeholder-teal-300 font-medium"
                                    placeholder="請輸入您的工號 (例: 10567)"
                                    required
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-bold text-teal-800 mb-2 ml-1">中文姓名</label>
                                <input 
                                    type="text" 
                                    value={userName}
                                    onChange={(e) => setUserName(e.target.value)}
                                    className="w-full px-5 py-3.5 bg-teal-50/50 border-2 border-teal-100 rounded-2xl focus:ring-0 focus:border-teal-400 outline-none transition text-teal-900 placeholder-teal-300 font-medium"
                                    placeholder="請輸入您的姓名"
                                    required
                                />
                            </div>
                            
                            <div className="pt-2">
                                <button 
                                    type="submit"
                                    className="w-full bg-gradient-to-r from-teal-400 to-emerald-500 hover:from-teal-500 hover:to-emerald-600 text-white font-bold py-4 px-4 rounded-2xl shadow-lg shadow-teal-500/30 transform transition active:scale-95 focus:outline-none"
                                >
                                    登入預約系統
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            );
        };

        // --- 2. 一般同仁儀表板 ---
        const UserDashboard = ({ user, reservations, setReservations, onLogout }) => {
            const [selectedDate, setSelectedDate] = useState('');
            const [returnNote, setReturnNote] = useState('');

            // 計算最快可預約日期 (17:00 判斷)
            const minBookableDate = useMemo(() => {
                const now = new Date();
                const target = new Date();
                if (now.getHours() >= 17) {
                    target.setDate(now.getDate() + 2); // 超過 17:00，只能約後天
                } else {
                    target.setDate(now.getDate() + 1); // 17:00 前，可約明天
                }
                return target.toISOString().split('T')[0];
            }, []);

            // 判斷某筆預約是否還可以取消
            const canCancel = (dateStr) => {
                const now = new Date();
                const resDate = new Date(dateStr);
                const cutoff = new Date(resDate);
                cutoff.setDate(cutoff.getDate() - 1);
                cutoff.setHours(17, 0, 0, 0);
                return now < cutoff;
            };

            const handleBook = (e) => {
                e.preventDefault();
                if (!selectedDate) return;
                
                // 檢查是否已預約該日
                const isExist = reservations.some(r => r.userId === user.userId && r.date === selectedDate);
                if (isExist) {
                    alert('您已經預約過這天的接駁車了！');
                    return;
                }

                const newRes = {
                    id: Date.now(),
                    userId: user.userId,
                    userName: user.userName,
                    date: selectedDate,
                    returnNote: returnNote || '無',
                    timestamp: new Date().toISOString()
                };
                
                setReservations([...reservations, newRes]);
                setSelectedDate('');
                setReturnNote('');
                alert('✅ 預約成功！');
            };

            const handleCancel = (id) => {
                if(confirm('確定要取消這筆預約嗎？')) {
                    setReservations(reservations.filter(r => r.id !== id));
                }
            };

            const myReservations = reservations.filter(r => r.userId === user.userId).sort((a, b) => new Date(a.date) - new Date(b.date));

            return (
                <div className="max-w-3xl mx-auto min-h-screen bg-gray-50 flex flex-col md:py-8">
                    <div className="bg-white shadow-xl rounded-none md:rounded-2xl overflow-hidden flex-1 flex flex-col">
                        <div className="bg-gradient-to-r from-teal-500 to-emerald-600 text-white p-5 flex justify-between items-center shadow-md">
                            <div className="flex items-center gap-3">
                                <span className="text-2xl">🚐</span>
                                <h1 className="text-xl font-bold">同仁預約專區</h1>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-teal-50 font-medium">嗨，{user.userName}</span>
                                <button onClick={onLogout} className="text-sm bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg transition">登出</button>
                            </div>
                        </div>

                        <div className="p-6 flex-1 flex flex-col">
                            {/* 預約表單 */}
                            <div className="bg-teal-50/50 rounded-2xl p-6 mb-8 border border-teal-100">
                                <h2 className="text-lg font-bold text-teal-800 mb-4 flex items-center gap-2">
                                    <span>📅</span> 新增預約
                                </h2>
                                <form onSubmit={handleBook} className="space-y-4">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <label className="block text-sm font-medium text-teal-700 mb-1">去程日期 (每日 17:00 截止隔日預約)</label>
                                            <input 
                                                type="date" 
                                                min={minBookableDate}
                                                value={selectedDate}
                                                onChange={(e) => setSelectedDate(e.target.value)}
                                                className="w-full px-4 py-2.5 border border-teal-200 rounded-xl focus:ring-2 focus:ring-teal-500 outline-none"
                                                required
                                            />
                                        </div>
                           