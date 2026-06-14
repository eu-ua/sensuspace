export default async function handler(req, res) {
    // Беремо ключ із захищених змінних оточення Vercel
    const apiKey = process.env.WEATHER_API_KEY;
    const city = "Kyiv";
    
    // Формуємо посилання для запиту
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${apiKey}`;

    try {
        const response = await fetch(url);
        const data = await response.json();
        
        // Відправляємо дані погоди назад на ваш сайт
        res.status(200).json(data);
    } catch (error) {
        res.status(500).json({ error: 'Помилка отримання погоди з сервера' });
    }
}