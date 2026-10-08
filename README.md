# Unchosen

English | [日本語](README.ja.md)

**You don't choose where you're born.**

Unchosen is a life simulator. You are born as one person somewhere in the world and live that life to the end. Your country and family are drawn from real birth numbers. Lifespan, household income, years of school, age at marriage, number of children and cause of death all come from each country's actual statistics.

It was inspired by the Korean web game "80억 분의 1" (1 in 8 billion). This is an independent project with no connection to the original.

## What's in it

- **162 countries**, covering nearly all of the world's births. You can draw your birthplace by share of births or share of population, and compare it with the country you were actually born in.
- **A life, one year at a time**: school, work, dating and marriage, children, illness and treatment, labor migration, losing family, retirement. Now and then you choose a path or a job yourself. If you leave it alone, the choice is made for you.
- **Statistical notes**: some events come with the number behind them, for example the share of women in that country who marry before 18.
- **Four people born in the same second**: four lives in other countries run alongside yours.
- **Death record and memorial**: when you die, your life is recorded. You can read other people's lives and light a candle for them.
- **Pixel art**: scenes from daily life and the ID photo are drawn on the fly.
- **Japanese and English**: switch in the top right corner.

## Let an AI fill in the details (optional)

The skeleton of a life (survival, income, education, marriage, children) stays statistical. On top of it, an LLM can write the small events of each year, unexpected events, one-off decisions, and a short story after death.

- Works with OpenRouter or any local OpenAI-compatible server (LM Studio, Ollama, mlx and others).
- Set it up under "Expand lives with AI" on the top screen.
- The API key is stored only in your browser. When the server relays requests, it passes the key to the LLM and does not record it.
- AI output is checked before use. Events that kill the character, marry them off or contradict the statistics are thrown away.

## Running it

Requires Node.js 22.13 or later (it uses `node:sqlite`; tested on 26).

```sh
npm install
npm run dev      # http://localhost:5173 (the API server starts on port 8787 too)
```

For production:

```sh
npm run build
npm start        # serves dist/ and the API on http://localhost:8787
```

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8787` | Server port |
| `AI_PRIVATE_RELAY` | `on` | Set to `off` to relay AI requests only to OpenRouter and OpenAI, never to local or LAN servers. Use `off` when the server is exposed to the internet |

Memorial entries are stored in `data/memorial.db` (SQLite).

## Data

Country statistics come from [Our World in Data](https://ourworldindata.org/) (CC BY 4.0), which compiles data from the UN, the World Bank, WHO, UNICEF, ILO, UNODC, IHME, the World Happiness Report and others. The latest value up to 2024 is used. Missing values are estimated from countries in the same region with similar income.

To rebuild the data:

```sh
npm run data:fetch   # downloads CSVs into data/raw/
npm run data:build   # writes src/data/countries.json
```

How it works:

- **Lifespan**: a life table built from infant and under-5 mortality plus a Gompertz-Makeham hazard, fitted to each country's life expectancy.
- **Income**: a log-normal distribution derived from the Gini coefficient. Your family's position in it is drawn at birth. Amounts are in purchasing-power-parity (PPP) dollars.
- **Checks**: the tests run 1,500 lives each in Japan, India and Nigeria and compare average lifespan, under-5 mortality and the share of child marriage with the real figures (`npm test`).

These are plausible lives built from statistics, not the lives of real people. Names, cities and events are made up.

## License

[MIT](LICENSE). The statistical data is under Our World in Data's CC BY 4.0.
