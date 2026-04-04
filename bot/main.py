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


def print_prediction(analysis, learning_feedback=None, weights=None):
    """Print a clear prediction from an AnalysisResult."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # Determine prediction text
    if analysis.signal == Signal.BUY_YES:
        apuesta = ">>> APUESTA A LA ALZA <<<"
        color_start = "\033[92m"  # Green
    elif analysis.signal == Signal.BUY_NO:
        apuesta = ">>> APUESTA A LA BAJA <<<"
        color_start = "\033[91m"  # Red
    else:
        apuesta = ">>> NO APOSTAR (senal debil) <<<"
        color_start = "\033[93m"  # Yellow

    color_end = "\033[0m"
    confidence_pct = analysis.confidence * 100

    # Build confidence bar
    bar_filled = int(confidence_pct / 5)
    bar_empty = 20 - bar_filled
    confidence_bar = "█" * bar_filled + "░" * bar_empty

    # Price change arrow
    if analysis.predicted_change_pct > 0:
        pred_arrow = "\033[92m/\\\033[0m"
        pred_dir = "SUBE"
    elif analysis.predicted_change_pct < 0:
        pred_arrow = "\033[91m\\/\033[0m"
        pred_dir = "BAJA"
    else:
        pred_arrow = "--"
        pred_dir = "LATERAL"

    print()
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║        PRONOSTICO BITCOIN - 5 MINUTOS           ║")
    print("  ╠══════════════════════════════════════════════════╣")

    # Learning feedback from previous prediction
    if learning_feedback is not None:
        if learning_feedback:
            fb = "\033[92m  ANTERIOR: ACERTASTE ✓\033[0m"
        else:
            fb = "\033[91m  ANTERIOR: FALLASTE ✗\033[0m"
        print(f"  ║                                                  ║")
        print(f"  ║  {fb}                        ║")

    print(f"  ║                                                  ║")
    print(f"  ║  Precio cierre:  ${analysis.current_price:>10,.2f}                ║")
    print(f"  ║  Hora:           {now}       ║")
    print(f"  ║                                                  ║")
    print(f"  ║  {color_start}{apuesta:^48}{color_end}  ║")
    print(f"  ║                                                  ║")
    print(f"  ║  Confianza:      {confidence_pct:5.1f}%                          ║")
    print(f"  ║  [{confidence_bar}]                ║")
    print(f"  ║                                                  ║")
    print("  ╠══════════════════════════════════════════════════╣")
    print("  ║  PRECIO ESTIMADO SIGUIENTE CICLO                ║")
    print(f"  ║                                                  ║")
    print(f"  ║  {pred_arrow}  ${analysis.predicted_price:>10,.2f}  ({analysis.predicted_change_pct:+.3f}%) {pred_dir:>8}  ║")
    print(f"  ║                                                  ║")
    print("  ╠══════════════════════════════════════════════════╣")
    print(f"  ║  Indicadores:                                    ║")
    print(f"  ║    RSI:        {analysis.rsi:6.1f}  {'(sobrecompra)' if analysis.rsi > 70 else '(sobreventa)' if analysis.rsi < 30 else '(neutral)':>20}  ║")
    print(f"  ║    Momentum:  {analysis.momentum:+8.4f}  {'(alcista)' if analysis.momentum > 0 else '(bajista)':>20}  ║")
    print(f"  ║    SMA 5:     ${analysis.sma_short:>10,.2f}                ║")
    print(f"  ║    SMA 20:    ${analysis.sma_long:>10,.2f}                ║")

    # Show adaptive weights and accuracy
    if weights is not None:
        print(f"  ║                                                  ║")
        print("  ╠══════════════════════════════════════════════════╣")
        print("  ║  MODELO ADAPTATIVO                               ║")
        print(f"  ║    Pesos: RSI={weights.w_rsi:.0%}  MOM={weights.w_momentum:.0%}  SMA={weights.w_sma:.0%}       ║")
        acc = weights.accuracy * 100
        print(f"  ║    Precision: {acc:5.1f}% ({weights.correct_predictions}/{weights.total_predictions} aciertos)         ║")

    print(f"  ║                                                  ║")
    print("  ╚══════════════════════════════════════════════════╝")
    print()


def run_predict():
    """Run a single automatic prediction."""
    strategy_config = load_strategy_config()
    strategy = BTCStrategy(strategy_config)

    print("\n  Obteniendo datos de BTC...")
    if not strategy.fetch_recent_prices():
        print("  ERROR: No se pudieron obtener precios de BTC")
        return

    analysis = strategy.analyze()
    print_prediction(analysis, weights=strategy.weights)


def run_apostar():
    """Interactive mode: user enters close price, bot says ALZA or BAJA."""
    strategy_config = load_strategy_config()
    strategy = BTCStrategy(strategy_config)

    print("\n  Obteniendo datos historicos de BTC (ultimos 60 min)...")
    if not strategy.fetch_recent_prices():
        print("  ERROR: No se pudieron obtener precios de BTC")
        return

    print("  Datos cargados OK.")

    if strategy.weights.total_predictions > 0:
        acc = strategy.weights.accuracy * 100
        print(f"  Modelo cargado: {strategy.weights.total_predictions} predicciones previas, {acc:.1f}% precision")

    print()
    print("  ╔══════════════════════════════════════════════════╗")
    print("  ║   MODO APUESTA - Ingresa el precio de cierre    ║")
    print("  ║   del ultimo ciclo de 5 min y te digo si        ║")
    print("  ║   apostar a la ALZA o a la BAJA.                ║")
    print("  ║                                                  ║")
    print("  ║   El bot aprende de cada resultado y ajusta      ║")
    print("  ║   sus pesos automaticamente.                     ║")
    print("  ║                                                  ║")
    print("  ║   Escribe 'salir' para terminar.                ║")
    print("  ╚══════════════════════════════════════════════════╝")

    round_num = 0

    while True:
        print()
        try:
            user_input = input("  Precio de cierre BTC (ej: 83250.50): ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\n\n  Saliendo...\n")
            break

        if user_input.lower() in ("salir", "exit", "quit", "q"):
            print("\n  Saliendo...\n")
            break

        # Parse price
        try:
            close_price = float(user_input.replace(",", "").replace("$", ""))
        except ValueError:
            print("  ERROR: Ingresa un numero valido (ej: 83250.50)")
            continue

        if close_price <= 0:
            print("  ERROR: El precio debe ser mayor a 0")
            continue

        round_num += 1

        # Learn from previous prediction using this new actual price
        learning_feedback = None
        if round_num > 1:
            learning_feedback = strategy.learn(close_price)

        # Add the user's close price to the historical data
        strategy.add_manual_price(close_price)

        # Run analysis with the updated price data
        analysis = strategy.analyze()

        print(f"\n  --- Ronda #{round_num} ---")
        print_prediction(analysis, learning_feedback=learning_feedback, weights=strategy.weights)


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
            if not strategy.fetch_recent_prices():
                print("  ERROR: No se pudieron obtener precios")
            else:
                analysis = strategy.analyze()
                print_prediction(analysis)
            time.sleep(interval)
    except KeyboardInterrupt:
        print(f"\n  Monitoreo detenido. Total predicciones: {count}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Polymarket Bitcoin 5-minute prediction trading bot"
    )
    parser.add_argument(
        "--apostar",
        action="store_true",
        help="Modo interactivo: ingresa precio de cierre y te dice ALZA o BAJA",
    )
    parser.add_argument(
        "--predict",
        action="store_true",
        help="Pronostico unico automatico: sube o baja BTC en 5 min",
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

    if args.apostar:
        run_apostar()
        return

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
