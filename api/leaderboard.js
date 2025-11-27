// Vercel Serverless Function - Leaderboard API
// Uses Vercel KV for data persistence

import { kv } from '@vercel/kv';

export default async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    if (req.method === 'POST') {
      const { userId, items, totalPrice, totalCalories, timestamp, action, updatedHistory } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      // Handle full history update (edit/delete)
      if (action === 'updateHistory' && updatedHistory) {
        const totalLiquid = updatedHistory.reduce((sum, i) => sum + ((i.ml || 0) * (i.count || 1)), 0);
        const dishesCount = updatedHistory.reduce((sum, i) => sum + (i.count || 1), 0);
        const newTotalPrice = updatedHistory.reduce((sum, i) => sum + ((i.price || 0) * (i.count || 1)), 0);
        const newTotalCalories = updatedHistory.reduce((sum, i) => sum + ((i.calories || 0) * (i.count || 1)), 0);

        const newUserData = {
          totalPrice: newTotalPrice,
          totalCalories: newTotalCalories,
          totalDishes: dishesCount,
          totalLiquid: totalLiquid,
          plates: [{ items: updatedHistory, totalPrice: newTotalPrice, totalCalories: newTotalCalories, timestamp: Date.now() }]
        };

        await kv.hset('users', { [userId]: newUserData });
        return res.status(200).json({ success: true, userData: newUserData });
      }

      // Submit plate data (original behavior)

      // Get or create user data
      const userData = await kv.hget('users', userId) || {
        totalPrice: 0,
        totalCalories: 0,
        totalDishes: 0,
        totalLiquid: 0,
        plates: []
      };

      // Calculate liquid ml and dishes count
      const liquidMl = (items || []).reduce((sum, i) => sum + ((i.ml || 0) * (i.count || 1)), 0);
      const dishesCount = (items || []).reduce((sum, i) => sum + (i.count || 1), 0);

      // Update user totals
      userData.totalPrice += totalPrice || 0;
      userData.totalCalories += totalCalories || 0;
      userData.totalDishes += dishesCount;
      userData.totalLiquid = (userData.totalLiquid || 0) + liquidMl;
      userData.plates.push({
        items,
        totalPrice,
        totalCalories,
        timestamp: timestamp || Date.now()
      });

      // Save user data
      await kv.hset('users', { [userId]: userData });

      // Update dish popularity with price info
      const dishData = await kv.get('dishData') || {};
      for (const item of (items || [])) {
        if (item.name) {
          const existing = dishData[item.name] || { count: 0, price: 0 };
          dishData[item.name] = {
            count: existing.count + (item.count || 1),
            price: item.price || existing.price || 0
          };
        }
      }
      await kv.set('dishData', dishData);

      return res.status(200).json({ success: true, userData });
    }

    if (req.method === 'GET') {
      const { type } = req.query;

      if (type === 'dishes') {
        // Get popular dishes
        const dishData = await kv.get('dishData') || {};
        const dishes = Object.entries(dishData).map(([name, data]) => ({
          name,
          count: data.count || 0,
          price: data.price || 0
        }));
        dishes.sort((a, b) => b.count - a.count);
        return res.status(200).json({ dishes: dishes.slice(0, 50) });
      }

      if (type === 'user') {
        // Get specific user data
        const { userId } = req.query;
        if (!userId) {
          return res.status(400).json({ error: 'userId required' });
        }
        const userData = await kv.hget('users', userId);
        if (!userData) {
          return res.status(200).json({ userData: null });
        }
        return res.status(200).json({ userData });
      }

      // Get user leaderboard
      const users = await kv.hgetall('users') || {};
      const leaderboard = Object.entries(users).map(([id, data]) => ({
        id,
        ...data
      }));

      return res.status(200).json({
        byPrice: [...leaderboard].sort((a, b) => b.totalPrice - a.totalPrice).slice(0, 20),
        byCalories: [...leaderboard].sort((a, b) => b.totalCalories - a.totalCalories).slice(0, 20),
        byDishes: [...leaderboard].sort((a, b) => b.totalDishes - a.totalDishes).slice(0, 20),
        byDrinks: [...leaderboard].sort((a, b) => (b.totalLiquid || 0) - (a.totalLiquid || 0)).slice(0, 20)
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
