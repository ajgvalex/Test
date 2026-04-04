# Polymarket Bitcoin 5-Minute Trading Bot

Bot automatizado que opera en los mercados de prediccion de Bitcoin a 5 minutos en Polymarket.

## Estrategia

El bot combina 3 indicadores para decidir si BTC subira o bajara:

| Indicador | Peso | Descripcion |
|-----------|------|-------------|
| **RSI** | 35% | Identifica condiciones de sobrecompra/sobreventa |
| **Momentum** | 35% | Tasa de cambio del precio en ventana corta |
| **SMA Crossover** | 30% | Cruce de media movil corta (5) vs larga (20) |

Si la confianza combinada supera el umbral (default 0.6), ejecuta el trade.

## Setup

```bash
cd bot

# Crear entorno virtual
python -m venv venv
source venv/bin/activate  # Linux/Mac
# venv\Scripts\activate   # Windows

# Instalar dependencias
pip install -r requirements.txt

# Configurar credenciales
cp .env.example .env
# Editar .env con tus credenciales de Polymarket
```

## Uso

```bash
# Solo analisis (sin trades):
python main.py --analyze-only

# Dry run (simula trades sin ejecutar):
python main.py

# Trading en vivo:
python main.py --live

# Opciones adicionales:
python main.py --amount 10        # $10 USDC por trade
python main.py --interval 60      # Revisar cada 60 segundos
python main.py -v                 # Logging detallado
```

## Configuracion (.env)

| Variable | Default | Descripcion |
|----------|---------|-------------|
| `TRADE_AMOUNT_USDC` | 5.0 | Monto por trade en USDC |
| `MAX_DAILY_TRADES` | 50 | Limite de trades por dia |
| `MAX_DAILY_LOSS_USDC` | 25.0 | Perdida maxima diaria |
| `POLL_INTERVAL_SECONDS` | 30 | Intervalo de revision |
| `DRY_RUN` | true | true = simular, false = en vivo |
| `RSI_PERIOD` | 14 | Periodo para calculo de RSI |
| `CONFIDENCE_THRESHOLD` | 0.6 | Umbral minimo de confianza |

## Arquitectura

```
bot/
├── main.py              # Entry point y CLI
├── bot.py               # Orquestador principal del bot
├── strategy.py          # Estrategia de trading (RSI + Momentum + SMA)
├── polymarket_client.py # Cliente API de Polymarket CLOB
├── config.py            # Configuracion y variables de entorno
├── requirements.txt     # Dependencias Python
└── .env.example         # Template de configuracion
```

## Advertencia

Este bot es para fines educativos y experimentales. El trading conlleva riesgo de perdida. Usa el modo dry run para probar antes de operar con dinero real.
