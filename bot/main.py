#!/usr/bin/env python3
"""Entry point for the Polymarket Bitcoin 5-minute trading bot.

Usage:
    # Dry run (default - no real trades):
    python main.py

    # Live trading:
    python main.py --live

    # Custom trade amount:
    python main.py --amount 10

    # Single analysis (no trading loop):
    python main.py --analyze-only
"""

import argparse
import logging
import sys

from config import load_polymarket_config, load_strategy_config, load_trading_config
from bot import TradingBot
from strategy import BTCStrategy


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


def run_analysis_only():
    """Run a single analysis and print results."""
    strategy_config = load_strategy_config()
    strategy = BTCStrategy(strategy_config)

    print("\n Fetching BTC price data...")
    if not strategy.fetch_recent_prices():
        print(" Failed to fetch prices")
        return

    analysis = strategy.analyze()
    print(f"\n{'='*50}")
    print(f"  BTC ANALYSIS")
    print(f"{'='*50}")
    print(f"  Price:      ${analysis.current_price:,.2f}")
    print(f"  RSI:        {analysis.rsi:.1f}")
    print(f"  Momentum:   {analysis.momentum:.6f}")
    print(f"  SMA Short:  ${analysis.sma_short:,.2f}")
    print(f"  SMA Long:   ${analysis.sma_long:,.2f}")
    print(f"  Signal:     {analysis.signal.value}")
    print(f"  Confidence: {analysis.confidence:.2%}")
    print(f"  Reason:     {analysis.reason}")
    print(f"{'='*50}\n")


def main():
    parser = argparse.ArgumentParser(
        description="Polymarket Bitcoin 5-minute prediction trading bot"
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
        help="Poll interval in seconds (overrides .env)",
    )
    parser.add_argument(
        "--analyze-only",
        action="store_true",
        help="Run a single analysis without trading",
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose/debug logging",
    )
    args = parser.parse_args()

    setup_logging(args.verbose)

    if args.analyze_only:
        run_analysis_only()
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
