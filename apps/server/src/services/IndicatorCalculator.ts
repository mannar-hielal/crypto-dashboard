/**
 * Technical Indicators Calculator
 * Implements EMA, MACD, and VWAP for Phase 1
 * All calculations are done on-the-fly with minimal memory overhead
 */

import {Kline, EMAValue, MACDValue, VWAPValue} from '../types';

/**
 * Exponential Moving Average (EMA)
 * Used for trend confirmation (9, 21, 200 periods)
 */
export class EMACalculator {
    private ema: number | null = null;
    private period: number;
    private multiplier: number;
    private candles: Kline[] = [];
    private maxHistory: number;

    constructor(period: number, maxHistory: number = 500) {
        this.period = period;
        this.maxHistory = maxHistory;
        // EMA multiplier = 2 / (period + 1)
        this.multiplier = 2 / (period + 1);
    }

    /**
     * Add a candle and calculate/update EMA
     */
    update(candle: Kline): EMAValue {
        this.candles.push(candle);

        // Trim history
        if (this.candles.length > this.maxHistory) {
            this.candles.shift();
        }

        if (this.ema === null) {
            // Initial EMA = Simple Moving Average
            if (this.candles.length >= this.period) {
                let sum = 0;
                for (let i = this.candles.length - this.period; i < this.candles.length; i++) {
                    sum += this.candles[i].close;
                }
                this.ema = sum / this.period;
            } else {
                // Not enough data yet, return a placeholder
                return {
                    value: candle.close,
                    period: this.period,
                    timestamp: candle.timestamp,
                };
            }
        } else {
            // Standard EMA formula: EMA = (Close - Previous EMA) × Multiplier + Previous EMA
            this.ema = (candle.close - this.ema) * this.multiplier + this.ema;
        }

        return {
            value: this.ema,
            period: this.period,
            timestamp: candle.timestamp,
        };
    }

    /**
     * Get current EMA value
     */
    getValue(): number | null {
        return this.ema;
    }

    /**
     * Reset calculator
     */
    reset(): void {
        this.ema = null;
        this.candles = [];
    }
}

/**
 * MACD (Moving Average Convergence Divergence)
 * Momentum indicator using 12-period EMA, 26-period EMA, and 9-period signal line
 */
export class MACDCalculator {
    private fastEMA: EMACalculator;
    private slowEMA: EMACalculator;
    private signalEMA: EMACalculator;
    private macdValues: number[] = [];
    private maxHistory: number;

    constructor(
        fastPeriod: number = 12,
        slowPeriod: number = 26,
        signalPeriod: number = 9,
        maxHistory: number = 500
    ) {
        this.fastEMA = new EMACalculator(fastPeriod, maxHistory);
        this.slowEMA = new EMACalculator(slowPeriod, maxHistory);
        this.signalEMA = new EMACalculator(signalPeriod, maxHistory);
        this.maxHistory = maxHistory;
    }

    /**
     * Add a candle and calculate MACD
     */
    update(candle: Kline): MACDValue {
        // Update both EMAs
        const fastValue = this.fastEMA.update(candle).value;
        const slowValue = this.slowEMA.update(candle).value;

        // MACD line = 12-period EMA - 26-period EMA
        // 🔐 Guard against NaN propagation — corrupted candle data could produce NaN
        // which silently infects all downstream calculations and misleads traders
        const macd = isFinite(fastValue) && isFinite(slowValue) ? fastValue - slowValue : 0;

        this.macdValues.push(macd);

        // Trim history
        if (this.macdValues.length > this.maxHistory) {
            this.macdValues.shift();
        }

        // Signal line = 9-period EMA of MACD
        // We need to create a pseudo-candle for the signal EMA
        const pseudoCandle: Kline = {
            timestamp: candle.timestamp,
            open: macd,
            high: macd,
            low: macd,
            close: macd,
            volume: 0,
            quoteAssetVolume: 0,
        };

        const signalValue = this.signalEMA.update(pseudoCandle).value;

        // Histogram = MACD - Signal
        const histogram = isFinite(macd) && isFinite(signalValue) ? macd - signalValue : 0;

        return {
            value: macd, // Primary value is MACD line
            macd,
            signal: signalValue,
            histogram,
            timestamp: candle.timestamp,
        };
    }

    /**
     * Get current MACD values
     */
    getValues(): { macd: number; signal: number; histogram: number } | null {
        const fastValue = this.fastEMA.getValue();
        const slowValue = this.slowEMA.getValue();

        if (fastValue === null || slowValue === null) return null;

       const macd = isFinite(fastValue) && isFinite(slowValue) ? fastValue - slowValue : 0;
       const signalValue = this.signalEMA.getValue() ?? macd;
       const histogram = isFinite(macd) && isFinite(signalValue) ? macd - signalValue : 0;

        return {macd, signal: signalValue, histogram};
    }

    /**
     * Reset calculator
     */
    reset(): void {
        this.fastEMA.reset();
        this.slowEMA.reset();
        this.signalEMA.reset();
        this.macdValues = [];
    }
}

/**
 * VWAP (Volume Weighted Average Price)
 * Resets daily at 00:00 UTC
 * Used for entry/exit decisions
 */
export class VWAPCalculator {
    private cumulativeTypicalPriceVolume: number = 0;
    private cumulativeVolume: number = 0;
    private vwap: number | null = null;
    private lastResetDate: string = '';

    /**
     * Add a candle and calculate VWAP
     */
    update(candle: Kline): VWAPValue {
        const candleDate = this.getUTCDateString(candle.timestamp);

        // Check if we need to reset (new UTC day)
        if (this.lastResetDate !== candleDate) {
            this.reset();
            this.lastResetDate = candleDate;
        }

        // Typical Price = (High + Low + Close) / 3
        const typicalPrice = (candle.high + candle.low + candle.close) / 3;

        // Cumulative TP × Volume
        this.cumulativeTypicalPriceVolume += typicalPrice * candle.volume;

        // Cumulative Volume
        this.cumulativeVolume += candle.volume;

        // VWAP = Cumulative (TP × V) / Cumulative V
        if (this.cumulativeVolume > 0) {
            const calculated = this.cumulativeTypicalPriceVolume / this.cumulativeVolume;
            // 🔐 Guard against NaN/Infinity from corrupted price or volume data
            this.vwap = isFinite(calculated) ? calculated : null;
        }

        return {
            value: this.vwap || candle.close,
            vwap: this.vwap || candle.close,
            cumVolume: this.cumulativeVolume,
            timestamp: candle.timestamp,
        };
    }

    /**
     * Get current VWAP value
     */
    getValue(): number | null {
        return this.vwap;
    }

    /**
     * Manually reset VWAP (e.g., at market close)
     */
    reset(): void {
        this.cumulativeTypicalPriceVolume = 0;
        this.cumulativeVolume = 0;
        this.vwap = null;
    }

    /**
     * Private: Get UTC date string (YYYY-MM-DD) for daily reset logic
     */
    private getUTCDateString(timestamp: number): string {
        const date = new Date(timestamp);
        const year = date.getUTCFullYear();
        const month = String(date.getUTCMonth() + 1).padStart(2, '0');
        const day = String(date.getUTCDate()).padStart(2, '0');

        return `${year}-${month}-${day}`;
    }
}

/**
 * Indicator Manager
 * Manages multiple indicators for a single symbol
 */
export class IndicatorManager {
    private ema9: EMACalculator;
    private ema21: EMACalculator;
    private ema200: EMACalculator;
    private macd: MACDCalculator;
    private vwap: VWAPCalculator;

    constructor() {
        this.ema9 = new EMACalculator(9);
        this.ema21 = new EMACalculator(21);
        this.ema200 = new EMACalculator(200);
        this.macd = new MACDCalculator();
        this.vwap = new VWAPCalculator();
    }

    /**
     * Update all indicators with a new candle
     */
    update(candle: Kline) {
        const ema9Value = this.ema9.update(candle);
        const ema21Value = this.ema21.update(candle);
        const ema200Value = this.ema200.update(candle);
        const macdValue = this.macd.update(candle);
        const vwapValue = this.vwap.update(candle);

        return {
            ema9: ema9Value,
            ema21: ema21Value,
            ema200: ema200Value,
            macd: macdValue,
            vwap: vwapValue,
            timestamp: candle.timestamp,
        };
    }

    /**
     * Get current values for all indicators
     */
    getAll() {
        return {
            ema9: this.ema9.getValue(),
            ema21: this.ema21.getValue(),
            ema200: this.ema200.getValue(),
            macd: this.macd.getValues(),
            vwap: this.vwap.getValue(),
        };
    }

    /**
     * Reset all indicators
     */
    reset(): void {
        this.ema9.reset();
        this.ema21.reset();
        this.ema200.reset();
        this.macd.reset();
        this.vwap.reset();
    }
}

export default IndicatorManager;

