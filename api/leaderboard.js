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
      // Submit plate data
      const { userId, items, totalPrice, totalCalories, timestamp } = req.body;

      if (!userId) {
        return res.status(400).json({ error: 'userId required' });
      }

      // Get or create user data
      const userData = await kv.hget('users', userId) || {
        totalPrice: 0,
        totalCalories: 0,
        totalDishes: 0,
        totalDrinks: 0,
        plates: []
      };

      // Calculate drinks count (items in 'Drink' category)
      const drinksCount = (items || []).filter(i => i.category === 'Drink').reduce((sum, i) => sum + (i.count || 1), 0);
      const dishesCount = (items || []).reduce((sum, i) => sum + (i.count || 1), 0);

      // Update user totals
      userData.totalPrice += totalPrice || 0;
      userData.totalCalories += totalCalories || 0;
      userData.totalDishes += dishesCount;
      userData.totalDrinks += drinksCount;
      userData.plates.push({
        items,
        totalPrice,
        totalCalories,
        timestamp: timestamp || Date.now()
      });

      // Save user data
      await kv.hset('users', { [userId]: userData });

      // Update dish popularity
      for (const item of (items || [])) {
        if (item.name) {
          const dishKey = `dish:${item.name}`;
          const currentCount = await kv.get(dishKey) || 0;
          await kv.set(dishKey, currentCount + (item.count || 1));
        }
      }

      // Update dish list for popularity ranking
      const dishList = await kv.get('dishList') || [];
      for (const item of (items || [])) {
        if (item.name && !dishList.includes(item.name)) {
          dishList.push(item.name);
        }
      }
      await kv.set('dishList', dishList);

      return res.status(200).json({ success: true, userData });
    }

    if (req.method === 'GET') {
      const { type } = req.query;

      if (type === 'dishes') {
        // Get popular dishes
        const dishList = await kv.get('dishList') || [];
        const dishes = [];
        for (const name of dishList) {
          const count = await kv.get(`dish:${name}`) || 0;
          dishes.push({ name, count });
        }
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
        byDrinks: [...leaderboard].sort((a, b) => b.totalDrinks - a.totalDrinks).slice(0, 20)
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Leaderboard error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
