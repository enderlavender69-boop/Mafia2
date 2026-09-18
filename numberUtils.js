// numberUtils.js - Comprehensive number handling with suffixes

class NumberUtils {
    static SUFFIXES = [
        { value: 1e3, symbol: 'K', name: 'Thousand' },
        { value: 1e6, symbol: 'M', name: 'Million' },
        { value: 1e9, symbol: 'B', name: 'Billion' },
        { value: 1e12, symbol: 'T', name: 'Trillion' },
        { value: 1e15, symbol: 'Qa', name: 'Quadrillion' },
        { value: 1e18, symbol: 'Qi', name: 'Quintillion' },
        { value: 1e21, symbol: 'Sx', name: 'Sextillion' },
        { value: 1e24, symbol: 'Sp', name: 'Septillion' },
        { value: 1e27, symbol: 'Oc', name: 'Octillion' },
        { value: 1e30, symbol: 'No', name: 'Nonillion' },
        { value: 1e33, symbol: 'Dc', name: 'Decillion' },
        { value: 1e36, symbol: 'UDc', name: 'Undecillion' },
        { value: 1e39, symbol: 'DDc', name: 'Duodecillion' },
        { value: 1e42, symbol: 'TDc', name: 'Tredecillion' },
        { value: 1e45, symbol: 'QaDc', name: 'Quattuordecillion' },
        { value: 1e48, symbol: 'QiDc', name: 'Quindecillion' },
        { value: 1e51, symbol: 'SxDc', name: 'Sexdecillion' },
        { value: 1e54, symbol: 'SpDc', name: 'Septendecillion' },
        { value: 1e57, symbol: 'OcDc', name: 'Octodecillion' },
        { value: 1e60, symbol: 'NoDc', name: 'Novemdecillion' },
        { value: 1e63, symbol: 'Vg', name: 'Vigintillion' },
        { value: 1e66, symbol: 'UVg', name: 'Unvigintillion' },
        { value: 1e69, symbol: 'DVg', name: 'Duovigintillion' },
        { value: 1e72, symbol: 'TVg', name: 'Tresvigintillion' },
        { value: 1e75, symbol: 'QaVg', name: 'Quattuorvigintillion' },
        { value: 1e78, symbol: 'QiVg', name: 'Quinvigintillion' },
        { value: 1e81, symbol: 'SxVg', name: 'Sesvigintillion' },
        { value: 1e84, symbol: 'SpVg', name: 'Septemvigintillion' },
        { value: 1e87, symbol: 'OcVg', name: 'Octovigintillion' },
        { value: 1e90, symbol: 'NoVg', name: 'Novemvigintillion' },
        { value: 1e93, symbol: 'Tg', name: 'Trigintillion' }
    ];

    static parseSuffix(valueStr) {
        if (!valueStr) return 0;
        
        valueStr = valueStr.toString().trim().replace(/[,\s]/g, '');
        
        // Direct number
        if (/^-?\d*\.?\d+$/.test(valueStr)) {
            return parseFloat(valueStr);
        }
        
        // Extract number and suffix
        const match = valueStr.match(/^(-?\d*\.?\d+)\s*([A-Za-z]+)$/);
        if (!match) return NaN;
        
        const numericPart = parseFloat(match[1]);
        const suffix = match[2].toLowerCase();
        
        // Find suffix (check both symbol and name)
        const suffixEntry = this.SUFFIXES.find(s => 
            s.symbol.toLowerCase() === suffix || 
            s.name.toLowerCase() === suffix
        );
        
        return suffixEntry ? numericPart * suffixEntry.value : NaN;
    }

    static format(value, options = {}) {
        const {
            precision = 2,
            useCommas = true,
            showFullSuffix = false
        } = options;

        // Handle very large numbers
        if (Math.abs(value) >= 1e21) {
            // Use scientific notation for extremely large numbers
            return value.toExponential(precision);
        }
        
        // Find appropriate suffix
        let suffixEntry = null;
        for (let i = this.SUFFIXES.length - 1; i >= 0; i--) {
            if (Math.abs(value) >= this.SUFFIXES[i].value) {
                suffixEntry = this.SUFFIXES[i];
                break;
            }
        }
        
        if (!suffixEntry || Math.abs(value) < 1000) {
            // Format normally with commas
            return this.formatWithCommas(value, useCommas);
        }
        
        // Scale down
        const scaledValue = value / suffixEntry.value;
        
        // Format with appropriate precision
        let formatted;
        if (precision === 0) {
            formatted = Math.round(scaledValue).toString();
        } else {
            formatted = scaledValue.toFixed(precision);
            // Remove trailing zeros
            formatted = formatted.replace(/\.?0+$/, '');
        }
        
        // Add commas to integer part if needed
        if (useCommas && formatted.includes('.')) {
            const parts = formatted.split('.');
            parts[0] = Number(parts[0]).toLocaleString('en-US');
            formatted = parts.join('.');
        }
        
        // Add suffix
        const suffixSymbol = showFullSuffix ? ` ${suffixEntry.name}` : suffixEntry.symbol;
        return formatted + suffixSymbol;
    }

    static formatWithCommas(value, useCommas = true) {
        if (!useCommas) return value.toString();
        
        const parts = value.toString().split('.');
        parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
        return parts.join('.');
    }

    static toBigInt(value) {
        if (typeof value === 'bigint') return value;
        if (typeof value === 'number') {
            return BigInt(Math.round(value));
        }
        if (typeof value === 'string') {
            const parsed = this.parseSuffix(value);
            return BigInt(Math.round(parsed));
        }
        return 0n;
    }

    static isValidNumber(valueStr) {
        if (!valueStr) return false;
        
        valueStr = valueStr.toString().trim();
        
        // Check for pure number
        if (/^-?\d*\.?\d+$/.test(valueStr)) return true;
        
        // Check for number with suffix
        const suffixPattern = /^-?\d*\.?\d+\s*(K|M|B|T|Qa|Qi|Sx|Sp|Oc|No|Dc|Vg|Tg)?$/i;
        return suffixPattern.test(valueStr);
    }

    static addCommas(value) {
        return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    }

    static randomBigInt(min, max) {
        const minBig = this.toBigInt(min);
        const maxBig = this.toBigInt(max);
        
        if (minBig > maxBig) {
            [minBig, maxBig] = [maxBig, minBig];
        }
        
        const range = maxBig - minBig;
        const randomRange = BigInt(Math.floor(Math.random() * Number(range)));
        return minBig + randomRange;
    }
}

module.exports = NumberUtils;
