#!/usr/bin/env python3
"""Entry point for the Polymarket Bitcoin 5-minute trading bot.

Usage:
    # Pronostico unico:
    python main.py --predict

    # Monitoreo continuo (cada 60s):
    python main.py --watch

    # Dry run (simula trades):
    python main.py

    # Live trading:
    python main.py --live
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from datetime import datetime, timezone

from config import load_polymarket_config, load_strategy_config, load_trading_config
from bot import TradingBot
from strategy import BTCStrategy, Signal


def setup_logging(verbose: bool = False):
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s [%(levelname)s] %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
            logging.FileHandler("bot.log", mode="a"),
        ],
    )


def print_prediction(strategy):
    """Run analysis and print a clear prediction."""
    if not strategy.fetch_recent_prices():
        print("  ERROR: No se pudieron obtener precios de BTC")
        return False

    analysis = strategy.analyze()
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # Determine prediction text
    if analysis.signal == Signal.BUY_YES:
        direction = "SUBE"
        arrow = "/\\"
        color_start = "\033[92m"  # Green
    elif analysis.signal == Signal.BUY_NO:
        direction = "BAJA"
        arrow = "\\/"
        color_start = "\033[91m"  # Red
    else:
        direction = "INDEFINIDO"
        arrow = "--"
        color_start = "\033[93m"  # Yellow

    color_end = "\033[0m"
    confidence_pct = analysis.confidence * 100

    # Build confidence bar [████████░░]
    bar_filled = int(confidence_pct / 5)
    bar_empty = 20 - bar_filled
    confidence_bar = "█" * bar_filled + "░" * bar_empty

    print()
    print(f"  ╔══════════════════════════════════════════════════╗")
    print(f"  ║        PRONOSTICO BITCOIN - 5 MINUTOS           ║")
    print(f"  ╠══════════════════════════════════════════════════╣")
    print(f"  ║                                                  ║")
    print(f"  ║  Precio actual:  ${analysis.current_price:>10,.2f}                ║")
    print(f"  ║  Hora:           {now}       ║")
    print(f"  ║                                                  ║")
    print(f"  ║  ┌────────────────────────────────────────────┐  ║")
    print(f"  ║  │  {color_start}{arrow} BTC va a: {direction:>10}  ({confidence_pct:5.1f}%){color_end}       │  ║")
    print(f"  ║  │  Confianza: [{confidence_bar}]  │  ║")
    print(f"  ║  └────────────────────────────────────────────┘  ║")
    print(f"  ║                                                  ║")
    print(f"  ║  Indicadores:                                    ║")
    print(f"  ║    RSI:        {analysis.rsi:6.1f}  {'(sobrecompra)' if analysis.rsi > 70 else '(sobreventa)' if analysis.rsi < 30 else '(neutral)':>20}  ║")
    print(f"  ║    Momentum:  {analysis.momentum:+8.4f}  {'(alcista)' if analysis.momentum > 0 else '(bajista)':>20}  ║")
    print(f"  ║    SMA 5:     ${analysis.sma_short:>10,.2f}                ║")
    print(f"  ║    SMA 20:    ${analysis.sma_long:>10,.2f}                ║")
    print(f"  ║    Tendencia:  {'SMA5 > SMA20 (alcista)' if analysis.sma_short > analysis.sma_long else 'SMA20 > SMA5 (bajista)':>29}  ║")
    print(f"  ║                                                  ║")
    print(f"  ╚══════════════════════════════════════════════════╝")
    print()

    return True


def run_predict():
    """Run a single prediction."""
    strategy_config = load_strategy_config()
    strategy = BTCStrategy(strategy_config)
    print_prediction(strategy)


def run_watch(interval: int = 60):
    """Run predictions continuously."""
    strategy_config = load_strategy_config()
    strategy = BTCStrategy(strategy_config)

    print(f"\n  Monitoreando BTC cada {interval}s... (Ctrl+C para salir)\n")

    count = 0
    try:
        while True:
            count += 1
            print(f"  --- Prediccion #{count} ---")
            print_prediction(strategy)
            time.sleep(interval)
    except KeyboardInterrupt:
        print(f"\n  Monitoreo detenido. Total predicciones: {count}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Polymarket Bitcoin 5-minute prediction trading bot"
    )
    parser.add_argument(
        "--predict",
        action="store_true",
        help="Pronostico unico: sube o baja BTC en 5 min",
    )
    parser.add_argument(
        "--watch",
        action="store_true",
        help="Monitoreo continuo con pronosticos repetidos",
    )
    parser.add_argument(
        "--live",
        action="store_true",
        help="Enable live trading (default is dry run)",
    )
    parser.add_argument(
        "--amount",
        type=float,
        help="Trade amount in USDC (overrides .env)",
    )
    parser.add_argument(
        "--interval",
        type=int,
        default=60,
        help="Intervalo entre predicciones en segundos (default: 60)",
    )
    parser.add_argument(
        "--analyze-only",
        action="store_true",
        help="Alias de --predict",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose/debug logging",
    )
    args = parser.parse_args()

    setup_logging(args.verbose)

    if args.predict or args.analyze_only:
        run_predict()
        return

    if args.watch:
        run_watch(args.interval)
        return

    # Load configs
    trading_config = load_trading_config()
    strategy_config = load_strategy_config()

    # Apply CLI overrides
    if args.live:
        trading_config.dry_run = False
    if args.amount:
        trading_config.trade_amount_usdc = args.amount
    if args.interval:
        trading_config.poll_interval_seconds = args.interval

    # Load Polymarket config only for live trading
    pm_config = None
    if not trading_config.dry_run:
        try:
            pm_config = load_polymarket_config()
        except ValueError as e:
            print(f"\n Error: {e}")
            print("Configure your .env file based on .env.example")
            sys.exit(1)

    # Start bot
    bot = TradingBot(
        polymarket_config=pm_config,
        trading_config=trading_config,
        strategy_config=strategy_config,
    )

    try:
        bot.start()
    except KeyboardInterrupt:
        print("\nShutting down...")
        bot.stop()


if __name__ == "__main__":
    main()
