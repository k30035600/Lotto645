console.log('[로또] app.js 로드됨');
const CONFIG = {
    DEFAULT_SET_COUNT: 5,
    LOTTO: {
        MAX_NUMBER: 45,
        MIN_NUMBER: 1,
        SET_SIZE: 6,
        MAX_GENERATION_ATTEMPTS: 1000,
        MAX_PREFERRED_NUMBERS: 5
    }
};

const DEFAULT_SET_COUNT = CONFIG.DEFAULT_SET_COUNT;
const LOTTO_CONSTANTS = CONFIG.LOTTO;
console.log('[로또] CONFIG/LOTTO_CONSTANTS 완료');

const HOT_COLD_RATIO_MAP = {
    "hot": { hot: 4, cold: 2 },
    "cold": { hot: 2, cold: 4 },
    "mixed": { hot: 3, cold: 3 }
};

const ODD_EVEN_RATIO_MAP = {
    "odd": { odd: 4, even: 2 },
    "even": { odd: 2, even: 4 },
    "balanced": { odd: 3, even: 3 }
};








/** 전역 상태 관리 모듈 */
const AppState = {
    currentSets: [],
    setSelectedBalls: Array.from({ length: (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_SET_COUNT) || 5 }, () => []),
    ballsToReplace: Array.from({ length: (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_SET_COUNT) || 5 }, () => null),
    rememberedBalls: [],
    gameModes: Array.from({ length: (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_SET_COUNT) || 5 }, () => "semi-auto"),
    activeFilters: { statFilter: "none", sequence: "none", oddEven: "none", hotCold: "none" },
    toggleStates: { statFilter: "none", sequence: "none", oddEven: "none", hotCold: "none" },
    statFilterOriginalNumbers: [],
    selectedPreferredNumbers: [],
    winStats: [],
    winStatsMap: new Map(),
    appearanceStatsMap: new Map(),
    avgCountCache: null,
    avgPercentageCache: null,
    winPercentageCache: null,
    appearancePercentageCache: null,
    currentStats: [],
    currentSort: "number-asc",
    allLotto645Data: [],
    startRound: null,
    endRound: null,
    reset() {
        const defaultCount = (typeof CONFIG !== 'undefined' && CONFIG.DEFAULT_SET_COUNT) || 5;
        this.currentSets = [];
        this.setSelectedBalls = Array.from({ length: defaultCount }, () => []);
        this.ballsToReplace = Array.from({ length: defaultCount }, () => null);
        this.rememberedBalls = [];
        this.statFilterOriginalNumbers = [];
        this.gameModes = Array.from({ length: defaultCount }, () => "semi-auto");
        this.activeFilters = { statFilter: "none", sequence: "none", oddEven: "none", hotCold: "none" };
        this.toggleStates = { statFilter: "none", sequence: "none", oddEven: "none", hotCold: "none" };
    }
};
console.log('[로또] AppState 완료');

let activeFilters = AppState.activeFilters;

/** 유틸리티 - XLSX 파일 로드 및 데이터 처리 */
const getBasePath = () => {
    const p = (window.location.pathname || '/').replace(/\/[^/]*$/, '') || '';
    return p.endsWith('/') ? p : p + '/';
};
const XLSX_PATHS = {
    get LOTTO645() { return getBasePath() + 'source/Lotto645.xlsx'; },
    get LOTTO023() { return getBasePath() + 'source/Lotto023.xlsx'; }
};
const LOTTO_NUMBER_COUNT = 6;
const MIN_ROUND = 1;
const DEFAULT_MAX_NUMBER = 45;

/** XLSX ArrayBuffer를 파싱하여 첫 시트를 객체 배열로 반환 */
const parseXLSX = (arrayBuffer) => {
    if (typeof XLSX === 'undefined') return [];
    const wb = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = wb.SheetNames[0];
    if (!firstSheetName) return [];
    const sheet = wb.Sheets[firstSheetName];
    return XLSX.utils.sheet_to_json(sheet, { defval: '' });
};

/** 숫자 문자열을 정수로 변환 (안전한 파싱) */
const safeParseInt = (value, defaultValue = 0) => {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
};

/** 로또 번호 배열 생성 (번호1~6) */
const extractLottoNumbers = (row) => {
    const numbers = [];
    for (let i = 1; i <= LOTTO_NUMBER_COUNT; i++) {
        const num = safeParseInt(row[`번호${i}`]);
        if (num > 0) numbers.push(num);
    }
    return numbers;
};

/** Lotto645 XLSX 파일 로드 및 파싱 */
const loadLotto645Data = async () => {
    const url = XLSX_PATHS.LOTTO645;
    console.log('[로또] Lotto645.xlsx 로드 시도:', url);
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeoutId);
        if (!response.ok) throw new Error(`Failed to load Lotto645: ${response.status} ${response.statusText}`);
        const ab = await response.arrayBuffer();
        const parsedData = parseXLSX(ab);
        const transformedData = parsedData.map(row => ({
            round: safeParseInt(row['회차']),
            date: String(row['날짜'] || ''),
            numbers: extractLottoNumbers(row),
            bonus: safeParseInt(row['보너스번호'])
        }));
        const result = transformedData.filter(item => item.round >= MIN_ROUND && item.numbers.length === LOTTO_NUMBER_COUNT);
        console.log('[로또] Lotto645.xlsx 로드 완료:', result.length, '건');
        return result;
    } catch (error) {
        console.error('[로또] Lotto645.xlsx 로드 실패:', error);
        if (error.name === 'AbortError') {
            console.error('[로또] 요청 시간 초과(15초). 서버가 실행 중인지 확인하세요.');
        }
        return [];
    }
};

/** Lotto023 XLSX 파일 로드 및 파싱 (게임 선택 데이터) */
const loadLotto023Data = async () => {
    console.log('[로또] Lotto023.xlsx 로드 시도:', XLSX_PATHS.LOTTO023);
    try {
        const response = await fetch(XLSX_PATHS.LOTTO023);
        if (!response.ok) throw new Error(`Failed to load Lotto023: ${response.statusText}`);
        const ab = await response.arrayBuffer();
        const parsedData = parseXLSX(ab);
        const transformedData = parsedData.map(row => ({
            round: safeParseInt(row['회차']),
            set: safeParseInt(row['세트']),
            game: safeParseInt(row['게임']),
            oddEven: safeParseInt(row['홀짝']),
            sequence: safeParseInt(row['연속']),
            hotCold: safeParseInt(row['핫콜']),
            gameMode: String(row['게임선택'] || ''),
            numbers: extractLottoNumbers({
                번호1: row['선택1'], 번호2: row['선택2'], 번호3: row['선택3'],
                번호4: row['선택4'], 번호5: row['선택5'], 번호6: row['선택6']
            })
        }));
        const result = transformedData.filter(item => item.round >= MIN_ROUND && item.numbers.length === LOTTO_NUMBER_COUNT);
        console.log('[로또] Lotto023.xlsx 로드 완료:', result.length, '건');
        return result;
    } catch (error) {
        console.error('[로또] Lotto023.xlsx 로드 실패:', error);
        return [];
    }
};

/** 모든 로또 번호 반환 (1부터 최대번호까지) */
const getAllNumbers = () => {
    const maxNumber = (typeof LOTTO_CONSTANTS !== 'undefined' && LOTTO_CONSTANTS.MAX_NUMBER) || DEFAULT_MAX_NUMBER;
    return Array.from({ length: maxNumber }, (_, i) => i + 1);
};

/** 숫자 배열 정렬 */
const sortNumbers = (numbers) => [...numbers].sort((a, b) => a - b);

/** 홀수/짝수 번호 분리 */
const getOddEvenNumbers = () => {
    const allNumbers = getAllNumbers();
    return {
        odd: allNumbers.filter(n => n % 2 === 1),
        even: allNumbers.filter(n => n % 2 === 0)
    };
};

/**
 * 통계 모듈
 * CSV 데이터를 기반으로 로또 통계를 계산하는 함수들
 */

/**
 * 번호별 당첨 횟수 계산 (보너스 제외)
 * @param {Array} lottoData - 로또 데이터 배열
 * @returns {Map<number, number>} 번호별 당첨 횟수 맵
 */
function calculateWinStats(lottoData) {
    const statsMap = new Map();
    
    // 모든 번호 초기화
    for (let i = 1; i <= LOTTO_CONSTANTS.MAX_NUMBER; i++) {
        statsMap.set(i, 0);
    }
    
    // 당첨 번호만 카운트 (보너스 제외)
    lottoData.forEach(round => {
        round.numbers.forEach(num => {
            if (num >= 1 && num <= LOTTO_CONSTANTS.MAX_NUMBER) {
                statsMap.set(num, (statsMap.get(num) || 0) + 1);
            }
        });
    });
    
    return statsMap;
}

/**
 * 번호별 출현 횟수 계산 (보너스 포함)
 * @param {Array} lottoData - 로또 데이터 배열
 * @returns {Map<number, number>} 번호별 출현 횟수 맵
 */
function calculateAppearanceStats(lottoData) {
    const statsMap = new Map();
    
    // 모든 번호 초기화
    for (let i = 1; i <= LOTTO_CONSTANTS.MAX_NUMBER; i++) {
        statsMap.set(i, 0);
    }
    
    // 당첨 번호 + 보너스 번호 카운트
    lottoData.forEach(round => {
        // 당첨 번호 카운트
        round.numbers.forEach(num => {
            if (num >= 1 && num <= LOTTO_CONSTANTS.MAX_NUMBER) {
                statsMap.set(num, (statsMap.get(num) || 0) + 1);
            }
        });
        // 보너스 번호 카운트
        if (round.bonus && round.bonus >= 1 && round.bonus <= LOTTO_CONSTANTS.MAX_NUMBER) {
            statsMap.set(round.bonus, (statsMap.get(round.bonus) || 0) + 1);
        }
    });
    
    return statsMap;
}

/**
 * 번호별 출현 비율 계산 (퍼센트)
 * @param {Map<number, number>} winStatsMap - 번호별 당첨 횟수 맵
 * @param {number} totalRounds - 전체 회차 수
 * @returns {Map<number, number>} 번호별 출현 비율 맵 (퍼센트)
 */
function calculatePercentageStats(winStatsMap, totalRounds) {
    const percentageMap = new Map();
    
    if (totalRounds === 0) {
        for (let i = 1; i <= LOTTO_CONSTANTS.MAX_NUMBER; i++) {
            percentageMap.set(i, 0);
        }
        return percentageMap;
    }
    
    winStatsMap.forEach((count, number) => {
        const percentage = (count / totalRounds) * 100;
        percentageMap.set(number, percentage);
    });
    
    return percentageMap;
}

/**
 * 통계 데이터 초기화
 * @param {Array} lottoData - 로또 데이터 배열
 */
function initializeStats(lottoData) {
    AppState.allLotto645Data = lottoData;
    
    if (lottoData.length > 0) {
        AppState.startRound = lottoData[lottoData.length - 1].round; // 가장 오래된 회차
        AppState.endRound = lottoData[0].round; // 가장 최근 회차
    }
    
    // 당첨 통계 계산 (보너스 제외)
    AppState.winStatsMap = calculateWinStats(lottoData);
    AppState.winStats = Array.from(AppState.winStatsMap.entries())
        .map(([number, count]) => ({ number, count }))
        .sort((a, b) => a.number - b.number);
    
    // 출현 통계 계산 (보너스 포함)
    AppState.appearanceStatsMap = calculateAppearanceStats(lottoData);
    
    // 당첨 비율 계산 (보너스 제외)
    const winPercentageMap = calculatePercentageStats(AppState.winStatsMap, lottoData.length);
    AppState.winPercentageCache = winPercentageMap;
    
    // 출현 비율 계산 (보너스 포함)
    const appearancePercentageMap = calculatePercentageStats(AppState.appearanceStatsMap, lottoData.length);
    AppState.appearancePercentageCache = appearancePercentageMap;
    
    // 기존 호환성을 위해 avgPercentageCache는 당첨 비율로 설정
    AppState.avgPercentageCache = winPercentageMap;
    
    // 평균 횟수 캐시
    const avgCount = lottoData.length > 0 
        ? lottoData.reduce((sum, round) => sum + round.numbers.length, 0) / (lottoData.length * LOTTO_CONSTANTS.SET_SIZE)
        : 0;
    AppState.avgCountCache = avgCount;
    
    // 현재 통계 업데이트
    updateCurrentStats();
}

/**
 * 현재 통계 업데이트
 */
function updateCurrentStats() {
    if (!AppState.winStats || AppState.winStats.length === 0) {
        AppState.currentStats = [];
        return;
    }
    
    AppState.currentStats = AppState.winStats.map(stat => ({
        number: stat.number,
        count: stat.count,
        percentage: AppState.avgPercentageCache 
            ? (AppState.avgPercentageCache.get(stat.number) || 0) 
            : 0
    }));
}

/**
 * 통계 기준으로 정렬
 * @param {Array} numbers - 정렬할 번호 배열
 * @param {boolean} byCount - true면 횟수로, false면 비율로 정렬
 * @param {boolean} descending - true면 내림차순, false면 오름차순
 * @returns {Array<number>} 정렬된 번호 배열
 */
function sortByStat(numbers, byCount = true, descending = true) {
    if (!AppState.winStatsMap || AppState.winStatsMap.size === 0) {
        return numbers;
    }
    
    const percentageMap = AppState.avgPercentageCache || new Map();
    
    return numbers.slice().sort((a, b) => {
        let valueA, valueB;
        
        if (byCount) {
            valueA = AppState.winStatsMap.get(a) || 0;
            valueB = AppState.winStatsMap.get(b) || 0;
        } else {
            valueA = percentageMap.get(a) || 0;
            valueB = percentageMap.get(b) || 0;
        }
        
        if (descending) {
            return valueB - valueA;
        } else {
            return valueA - valueB;
        }
    });
}

/**
 * 통계 기준으로 필터링된 번호 반환
 * @param {boolean} highCount - true면 높은 순위, false면 낮은 순위
 * @returns {Array<number>} 필터링된 번호 배열
 */
function getFilteredNumbersByCount(highCount = true) {
    if (!AppState.winStats || AppState.winStats.length === 0) {
        return getAllNumbers();
    }
    
    const sortedStats = AppState.winStats.slice().sort((a, b) => {
        if (highCount) {
            return b.count - a.count;
        } else {
            return a.count - b.count;
        }
    });
    
    // 상위/하위 절반 반환
    const halfLength = Math.ceil(sortedStats.length / 2);
    return sortedStats.slice(0, halfLength).map(stat => stat.number);
}

/**
 * 핫/콜 번호 계산 및 반환
 * @returns {Object} {hot: 핫 번호 배열, cold: 콜 번호 배열}
 */
function getHotColdNumbers() {
    if (!AppState.winStats || AppState.winStats.length === 0) {
        return { hot: [], cold: [] };
    }
    
    const sortedStats = AppState.winStats.slice().sort((a, b) => b.count - a.count);
    const halfLength = Math.ceil(sortedStats.length / 2);
    
    const hot = sortedStats.slice(0, halfLength).map(stat => stat.number);
    const cold = sortedStats.slice(halfLength).map(stat => stat.number);
    
    return { hot, cold };
}

/**
 * 선호 번호 가져오기 (현재는 선택된 선호 번호 반환)
 * @returns {Array<number>} 선호 번호 배열
 */
function getPreferredNumbers() {
    return AppState.selectedPreferredNumbers || [];
}

function shuffledPool(filterOdd = false, filterEven = false) {
    let numbers = getAllNumbers();
    
    const oddEvenFilter = filterOdd ? "odd" : (filterEven ? "even" : "none");
    numbers = applyOddEvenFilter(numbers, oddEvenFilter);

    for (let i = numbers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
    }
    return numbers;
}

function hasSequential(sorted) {
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
            return true;
        }
    }
    return false;
}

function countSequentialPairs(sorted) {
    let count = 0;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
            count++;
        }
    }
    return count;
}

function checkOddEvenRatio(sorted, oddEvenFilter) {
    if (!oddEvenFilter || oddEvenFilter === "none") {
        return true;
    }
    
    const { odd, even } = getOddEvenNumbers();
    const oddSet = new Set(odd);
    const evenSet = new Set(even);
    
    const oddCount = sorted.filter(n => oddSet.has(n)).length;
    const evenCount = sorted.filter(n => evenSet.has(n)).length;
    
    const targetRatio = ODD_EVEN_RATIO_MAP[oddEvenFilter];
    return targetRatio ? oddCount === targetRatio.odd && evenCount === targetRatio.even : true;
}

function checkStatFilter(sorted, statFilter) {
    if (!isStatFilter(statFilter)) {
        return true;
    }
    const highCountNumbers = new Set(getFilteredNumbersByCount(true));
    return sorted.every(n => highCountNumbers.has(n));
}

function checkSequence(sorted, sequenceFilter) {
    if (!sequenceFilter || sequenceFilter === "none") {
        const hasSeq = hasSequential(sorted);
        return !hasSeq;
    }
    const sequentialCount = countSequentialPairs(sorted);
    const requiredCount = parseInt(sequenceFilter) || 0;
    return sequentialCount === requiredCount;
}

function checkHotCold(sorted, hotColdFilter, statFilter) {
    if (!canApplyHotColdFilter(statFilter) || !hotColdFilter || hotColdFilter === "none") {
        return true;
    }
    
    const { hot, cold } = getHotColdNumbers();
    const hotSet = new Set(hot);
    const coldSet = new Set(cold);
    
    const hotCount = sorted.filter(n => hotSet.has(n)).length;
    const coldCount = sorted.filter(n => coldSet.has(n)).length;
    
    const targetRatio = HOT_COLD_RATIO_MAP[hotColdFilter];
    return targetRatio ? hotCount === targetRatio.hot && coldCount === targetRatio.cold : true;
}

function passesConstraints(nums, filters) {
    const sorted = sortNumbers(nums);
    
    const statFilterCheck = checkStatFilter(sorted, filters.statFilter);
    const sequenceCheck = checkSequence(sorted, filters.sequence);
    const hotColdCheck = checkHotCold(sorted, filters.hotCold, filters.statFilter);
    const oddEvenCheck = checkOddEvenRatio(sorted, filters.oddEven);

    return statFilterCheck && sequenceCheck && hotColdCheck && oddEvenCheck;
}

function getFilteredPool() {
    const pool = getAllNumbers();
    let filteredPool = pool;
    
    const isCount = isCountFilter(activeFilters.statFilter);
    const isPercentage = isPercentageFilter(activeFilters.statFilter);
    
    if (isCount || isPercentage) {
        const highCountNumbers = new Set(getFilteredNumbersByCount(true));
        filteredPool = filteredPool.filter(n => highCountNumbers.has(n));
        if (isCount) {
            const descending = activeFilters.statFilter === "count-desc";
            sortByStat(filteredPool, true, descending);
        } else {
            const descending = activeFilters.statFilter === "percentage-desc";
            sortByStat(filteredPool, false, descending);
        }
    }
    
    filteredPool = applyOddEvenFilter(filteredPool, activeFilters.oddEven);
    if (canApplyHotColdFilter(activeFilters.statFilter)) {
        filteredPool = applyHotColdFilter(filteredPool, activeFilters.hotCold);
    }
    
    return filteredPool;
}

function getOddEvenTargetCounts() {
    if (activeFilters.oddEven === "odd") return { oddCount: 4, evenCount: 2 };
    if (activeFilters.oddEven === "even") return { oddCount: 2, evenCount: 4 };
    if (activeFilters.oddEven === "balanced") return { oddCount: 3, evenCount: 3 };
    return null;
}

// selectNumbersWithOddEvenRatio는 game-logic.js에서 가져옴

function applyOddEvenFilter(numbers, oddEvenFilter) {
    if (numbers.length === 0 || oddEvenFilter === "none") {
        return numbers;
    }
    
    const { odd, even } = getOddEvenNumbers();
    const oddSet = new Set(odd);
    const evenSet = new Set(even);
    
    if (oddEvenFilter === "odd" || oddEvenFilter === "even" || oddEvenFilter === "balanced") {
        return numbers.filter(n => oddSet.has(n) || evenSet.has(n));
    }
    return numbers;
}

function applyHotColdFilter(numbers, hotColdFilter) {
    if (numbers.length === 0 || hotColdFilter === "none") {
        return numbers;
    }
    
    const { hot, cold } = getHotColdNumbers();
    const hotSet = new Set(hot);
    const coldSet = new Set(cold);
    
    if (hotColdFilter === "hot" || hotColdFilter === "cold" || hotColdFilter === "mixed") {
        return numbers.filter(n => hotSet.has(n) || coldSet.has(n));
    }
    return numbers;
}

function isPreferredNumberFilter(statFilter) {
    return statFilter === "none" || statFilter === "auto";
}

function isStatNumberFilter(statFilter) {
    return statFilter !== "none" && statFilter !== "auto";
}

function canApplyHotColdFilter(statFilter) {
    return statFilter === "none" || statFilter === "auto";
}

function isCountFilter(statFilter) {
    return statFilter === "count-desc" || statFilter === "count-asc";
}

function isPercentageFilter(statFilter) {
    return statFilter === "percentage-desc" || statFilter === "percentage-asc";
}

function isStatFilter(statFilter) {
    return isCountFilter(statFilter) || isPercentageFilter(statFilter);
}

function isStatCountFilter() {
    return isCountFilter(activeFilters.statFilter);
}

/**
 * 게임 로직 모듈
 * 번호 생성, 필터링, 제약 조건 체크 등의 게임 로직을 담당합니다.
 */

/**
 * 홀짝 비율에 맞춰 번호 선택
 */
function selectNumbersWithOddEvenRatio(pool, existingNumbers, totalNeeded) {
    const targetCounts = getOddEvenTargetCounts();
    
    // 홀짝 비율 제한이 없으면 랜덤으로 선택
    if (!targetCounts) {
        const result = [...existingNumbers];
        const resultSet = new Set(result);
        const availablePool = pool.filter(n => !resultSet.has(n));
        const shuffled = [...availablePool].sort(() => Math.random() - 0.5);
        
        for (let i = 0; i < shuffled.length && result.length < totalNeeded; i++) {
            result.push(shuffled[i]);
        }
        
        return result.slice(0, totalNeeded);
    }
    
    const { oddCount: targetOdd, evenCount: targetEven } = targetCounts;
    
    // 기존 번호에서 홀수/짝수 개수 계산
    let currentOdd = existingNumbers.filter(n => n % 2 === 1).length;
    let currentEven = existingNumbers.filter(n => n % 2 === 0).length;
    
    const result = [...existingNumbers];
    const resultSet = new Set(result);
    
    // 풀에서 홀수/짝수 분리
    const oddPool = pool.filter(n => n % 2 === 1 && !resultSet.has(n));
    const evenPool = pool.filter(n => n % 2 === 0 && !resultSet.has(n));
    
    // 셔플
    const shuffledOdd = [...oddPool].sort(() => Math.random() - 0.5);
    const shuffledEven = [...evenPool].sort(() => Math.random() - 0.5);
    
    // 목표 비율에 맞춰 정확히 선택
    const needOdd = Math.max(0, targetOdd - currentOdd);
    const needEven = Math.max(0, targetEven - currentEven);
    const remaining = totalNeeded - result.length;
    
    // 목표 비율에 맞춰 홀수/짝수 선택
    let oddSelected = 0;
    let evenSelected = 0;
    
    // 우선순위: 목표 비율에 맞춰 선택
    while (result.length < totalNeeded) {
        const needOddNow = needOdd - oddSelected;
        const needEvenNow = needEven - evenSelected;
        const remainingSlots = totalNeeded - result.length;
        
        // 목표 비율을 우선적으로 맞춤
        if (needOddNow > 0 && oddSelected < shuffledOdd.length && oddSelected < needOdd) {
            result.push(shuffledOdd[oddSelected]);
            resultSet.add(shuffledOdd[oddSelected]);
            oddSelected++;
        } else if (needEvenNow > 0 && evenSelected < shuffledEven.length && evenSelected < needEven) {
            result.push(shuffledEven[evenSelected]);
            resultSet.add(shuffledEven[evenSelected]);
            evenSelected++;
        } else {
            // 목표 비율 달성 후 남은 자리 채우기
            if (oddSelected < shuffledOdd.length && (evenSelected >= shuffledEven.length || Math.random() < 0.5)) {
                result.push(shuffledOdd[oddSelected]);
                resultSet.add(shuffledOdd[oddSelected]);
                oddSelected++;
            } else if (evenSelected < shuffledEven.length) {
                result.push(shuffledEven[evenSelected]);
                resultSet.add(shuffledEven[evenSelected]);
                evenSelected++;
            } else {
                // 풀에 더 이상 번호가 없으면 중단
                break;
            }
        }
    }
    
    // 최종 결과의 홀짝 비율 확인 및 조정
    const finalOdd = result.filter(n => n % 2 === 1).length;
    const finalEven = result.filter(n => n % 2 === 0).length;
    
    // 목표 비율과 다르면 간단한 재시도 (성능 최적화)
    if (finalOdd !== targetOdd || finalEven !== targetEven) {
        // 풀에 충분한 홀수/짝수가 있는지 확인
        if (oddPool.length >= targetOdd && evenPool.length >= targetEven) {
            // 간단한 재시도: 목표 비율에 정확히 맞춤
            const retryResult = [...existingNumbers];
            const retrySet = new Set(retryResult);
            const retryOddPool = pool.filter(n => n % 2 === 1 && !retrySet.has(n));
            const retryEvenPool = pool.filter(n => n % 2 === 0 && !retrySet.has(n));
            
            // 재시도 시 기존 번호의 홀짝 개수 다시 계산
            const retryCurrentOdd = retryResult.filter(n => n % 2 === 1).length;
            const retryCurrentEven = retryResult.filter(n => n % 2 === 0).length;
            const retryNeedOdd = Math.max(0, targetOdd - retryCurrentOdd);
            const retryNeedEven = Math.max(0, targetEven - retryCurrentEven);
            
            const retryShuffledOdd = [...retryOddPool].sort(() => Math.random() - 0.5);
            const retryShuffledEven = [...retryEvenPool].sort(() => Math.random() - 0.5);
            
            // 목표 비율에 정확히 맞춰 선택
            for (let i = 0; i < retryNeedOdd && retryResult.length < totalNeeded && i < retryShuffledOdd.length; i++) {
                retryResult.push(retryShuffledOdd[i]);
            }
            for (let i = 0; i < retryNeedEven && retryResult.length < totalNeeded && i < retryShuffledEven.length; i++) {
                retryResult.push(retryShuffledEven[i]);
            }
            
            // 목표 비율이 맞는지 확인
            const finalRetryOdd = retryResult.filter(n => n % 2 === 1).length;
            const finalRetryEven = retryResult.filter(n => n % 2 === 0).length;
            
            if (finalRetryOdd === targetOdd && finalRetryEven === targetEven && retryResult.length === totalNeeded) {
                return retryResult.slice(0, totalNeeded);
            }
        }
    }
    
    return result.slice(0, totalNeeded);
}

/**
 * 6개 번호 선택 (기본)
 */
function pickSix() {
    const pool = shuffledPool(false, false);
    const poolSet = new Set(pool);
    let filteredPool = pool;
    
    if (isStatFilter(activeFilters.statFilter)) {
        const highCountNumbers = new Set(getFilteredNumbersByCount(true));
        filteredPool = pool.filter(n => highCountNumbers.has(n));
    }
    
    // 핫콜 필터: 수동선택 또는 자동선택 모드에서만 적용
    if (canApplyHotColdFilter(activeFilters.statFilter)) {
        filteredPool = applyHotColdFilter(filteredPool, activeFilters.hotCold);
    }
    
    const filteredPoolSet = new Set(filteredPool);
    const preferred = getPreferredNumbers().filter(n => poolSet.has(n) && filteredPoolSet.has(n));
    
    // 홀짝 비율에 맞춰 번호 선택
    const result = selectNumbersWithOddEvenRatio(filteredPool, preferred, LOTTO_CONSTANTS.SET_SIZE);
    
    return result.slice(0, LOTTO_CONSTANTS.SET_SIZE);
}

/**
 * 연속된 번호 쌍 찾기
 */
function findSequentialPairs(numbers) {
    const sorted = sortNumbers(numbers);
    const pairs = [];
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
            pairs.push([sorted[i - 1], sorted[i]]);
        }
    }
    return pairs;
}

/**
 * 홀짝/핫콜 비율을 모두 고려하여 번호 선택
 */
function selectNumbersWithOddEvenAndHotColdRatio(pool, existingNumbers, totalNeeded, targetCounts, hotColdFilter, hotSet, coldSet) {
    const result = [...existingNumbers];
    const resultSet = new Set(result);
    const availablePool = pool.filter(n => !resultSet.has(n));
    
    // 홀짝/핫콜 비율 제한이 없으면 랜덤으로 선택
    if (!targetCounts && (!hotColdFilter || hotColdFilter === "none")) {
        const shuffled = [...availablePool].sort(() => Math.random() - 0.5);
        for (let i = 0; i < shuffled.length && result.length < totalNeeded; i++) {
            result.push(shuffled[i]);
        }
        return result.slice(0, totalNeeded);
    }
    
    // 목표 비율 계산
    let targetOdd = 0;
    let targetEven = 0;
    if (targetCounts) {
        targetOdd = targetCounts.oddCount;
        targetEven = targetCounts.evenCount;
    }
    
    let targetHot = 0;
    let targetCold = 0;
    if (hotColdFilter && hotColdFilter !== "none") {
        const targetRatio = HOT_COLD_RATIO_MAP[hotColdFilter];
        if (targetRatio) {
            targetHot = targetRatio.hot;
            targetCold = targetRatio.cold;
        }
    }
    
    // 기존 번호에서 개수 계산
    let currentOdd = existingNumbers.filter(n => n % 2 === 1).length;
    let currentEven = existingNumbers.filter(n => n % 2 === 0).length;
    let currentHot = existingNumbers.filter(n => hotSet.has(n)).length;
    let currentCold = existingNumbers.filter(n => coldSet.has(n)).length;
    
    // 필요 개수 계산
    let needOdd = 0;
    let needEven = 0;
    let needHot = 0;
    let needCold = 0;
    
    if (targetCounts) {
        // 홀짝 비율이 있는 경우: 정확히 목표 비율에 맞춤
        needOdd = Math.max(0, targetOdd - currentOdd);
        needEven = Math.max(0, targetEven - currentEven);
    } else {
        // 홀짝 비율이 없는 경우: 전체 개수에서 기존 개수 빼기
        const remaining = totalNeeded - existingNumbers.length;
        needOdd = remaining;
        needEven = remaining;
    }
    
    if (hotColdFilter && hotColdFilter !== "none") {
        // 핫콜 비율이 있는 경우: 정확히 목표 비율에 맞춤
        needHot = Math.max(0, targetHot - currentHot);
        needCold = Math.max(0, targetCold - currentCold);
    }
    
    // 풀을 홀짝/핫콜로 분류
    const oddHotPool = availablePool.filter(n => n % 2 === 1 && hotSet.has(n));
    const oddColdPool = availablePool.filter(n => n % 2 === 1 && coldSet.has(n));
    const evenHotPool = availablePool.filter(n => n % 2 === 0 && hotSet.has(n));
    const evenColdPool = availablePool.filter(n => n % 2 === 0 && coldSet.has(n));
    
    // 셔플
    const shuffledOddHot = [...oddHotPool].sort(() => Math.random() - 0.5);
    const shuffledOddCold = [...oddColdPool].sort(() => Math.random() - 0.5);
    const shuffledEvenHot = [...evenHotPool].sort(() => Math.random() - 0.5);
    const shuffledEvenCold = [...evenColdPool].sort(() => Math.random() - 0.5);
    
    // 비율에 맞춰 선택
    let oddHotIdx = 0, oddColdIdx = 0, evenHotIdx = 0, evenColdIdx = 0;
    
    // 핫콜 필터가 있는 경우 핫콜 비율을 정확히 맞춤
    if (hotColdFilter && hotColdFilter !== "none") {
        // 핫콜 비율에 맞춰 선택 (핫 4개, 콜 2개 등)
        while (result.length < totalNeeded && (needHot > 0 || needCold > 0)) {
            let selected = false;
            
            // 핫이 더 많이 필요하면 핫 우선 선택
            if (needHot > needCold && needHot > 0) {
                // 홀짝 필터가 있으면 홀짝 비율도 고려
                if (targetCounts && needOdd > 0 && oddHotIdx < shuffledOddHot.length) {
                    const num = shuffledOddHot[oddHotIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needOdd--;
                    needHot--;
                    selected = true;
                } else if (targetCounts && needEven > 0 && evenHotIdx < shuffledEvenHot.length) {
                    const num = shuffledEvenHot[evenHotIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needEven--;
                    needHot--;
                    selected = true;
                } else if (!targetCounts && oddHotIdx < shuffledOddHot.length) {
                    // 홀짝 필터가 없으면 핫만 고려
                    const num = shuffledOddHot[oddHotIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needHot--;
                    selected = true;
                } else if (!targetCounts && evenHotIdx < shuffledEvenHot.length) {
                    const num = shuffledEvenHot[evenHotIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needHot--;
                    selected = true;
                }
            } 
            // 콜이 더 많이 필요하거나 핫과 같으면 콜 우선 선택
            else if (needCold > 0) {
                if (targetCounts && needOdd > 0 && oddColdIdx < shuffledOddCold.length) {
                    const num = shuffledOddCold[oddColdIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needOdd--;
                    needCold--;
                    selected = true;
                } else if (targetCounts && needEven > 0 && evenColdIdx < shuffledEvenCold.length) {
                    const num = shuffledEvenCold[evenColdIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needEven--;
                    needCold--;
                    selected = true;
                } else if (!targetCounts && oddColdIdx < shuffledOddCold.length) {
                    const num = shuffledOddCold[oddColdIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needCold--;
                    selected = true;
                } else if (!targetCounts && evenColdIdx < shuffledEvenCold.length) {
                    const num = shuffledEvenCold[evenColdIdx++];
                    result.push(num);
                    resultSet.add(num);
                    needCold--;
                    selected = true;
                }
            }
            
            if (!selected) {
                // 핫콜 비율을 맞출 수 없으면 남은 풀에서 선택
                const remaining = availablePool.filter(n => !resultSet.has(n));
                if (remaining.length > 0) {
                    const shuffled = [...remaining].sort(() => Math.random() - 0.5);
                    result.push(shuffled[0]);
                    resultSet.add(shuffled[0]);
                    // 선택한 번호의 속성에 따라 need 값 조정
                    if (hotSet.has(shuffled[0]) && needHot > 0) needHot--;
                    if (coldSet.has(shuffled[0]) && needCold > 0) needCold--;
                    if (targetCounts) {
                        if (shuffled[0] % 2 === 1 && needOdd > 0) needOdd--;
                        if (shuffled[0] % 2 === 0 && needEven > 0) needEven--;
                    }
                } else {
                    break;
                }
            }
        }
    }
    
    // 남은 자리를 홀짝 비율에 맞춰 채우기 (핫콜 필터가 없거나 핫콜 비율을 이미 맞춘 경우)
    while (result.length < totalNeeded) {
        let selected = false;
        
        if (targetCounts) {
            // 홀짝 비율 우선
            if (needOdd > 0) {
                const remainingOdd = availablePool.filter(n => !resultSet.has(n) && n % 2 === 1);
                if (remainingOdd.length > 0) {
                    const shuffled = [...remainingOdd].sort(() => Math.random() - 0.5);
                    result.push(shuffled[0]);
                    resultSet.add(shuffled[0]);
                    needOdd--;
                    selected = true;
                }
            } else if (needEven > 0) {
                const remainingEven = availablePool.filter(n => !resultSet.has(n) && n % 2 === 0);
                if (remainingEven.length > 0) {
                    const shuffled = [...remainingEven].sort(() => Math.random() - 0.5);
                    result.push(shuffled[0]);
                    resultSet.add(shuffled[0]);
                    needEven--;
                    selected = true;
                }
            }
        }
        
        if (!selected) {
            // 남은 풀에서 선택
            const remaining = availablePool.filter(n => !resultSet.has(n));
            if (remaining.length > 0) {
                const shuffled = [...remaining].sort(() => Math.random() - 0.5);
                result.push(shuffled[0]);
                resultSet.add(shuffled[0]);
            } else {
                break;
            }
        }
    }
    
    return result.slice(0, totalNeeded);
}

/**
 * UI 헬퍼 함수 모듈
 * UI 렌더링에 사용되는 유틸리티 함수들
 */

/**
 * 번호에 따른 공 클래스 반환 (동행복권 색상)
 */
function getBallClass(num) {
    if (num <= 10) return "ball-yellow";    // 1-10: 노란색 (#FBC400)
    if (num <= 20) return "ball-blue";      // 11-20: 파란색 (#69C8F2)
    if (num <= 30) return "ball-red";       // 21-30: 빨간색 (#FF7272)
    if (num <= 40) return "ball-gray";      // 31-40: 회색 (#AAAAAA)
    return "ball-green";                    // 41-45: 녹색 (#B0D840)
}

/**
 * RGB를 보색으로 변환
 */
function getComplementaryColor(hex) {
    // # 제거
    hex = hex.replace('#', '');
    
    // RGB 추출
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // 보색 계산 (255에서 각 값을 빼기)
    const compR = 255 - r;
    const compG = 255 - g;
    const compB = 255 - b;
    
    // 밝기 계산 (상대적 밝기)
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    
    // 밝은 배경이면 어두운 글자, 어두운 배경이면 밝은 글자
    if (brightness > 128) {
        return '#000000'; // 어두운 글자
    } else {
        return '#FFFFFF'; // 밝은 글자
    }
}

/**
 * 통계용 공 생성
 */
function createStatBall(num, size = 24, fontSize = "0.8rem", isNonMatching = false) {
    const ball = document.createElement("div");
    if (isNonMatching) {
        ball.className = "stat-ball";
        ball.style.backgroundColor = "#000000";
        ball.style.color = "#ffffff";
        ball.style.border = "2px solid #000000";
    } else {
        ball.className = `stat-ball ${getBallClass(num)}`;
        
        // 배경색에 따른 보색 계산 및 적용
        const bgColors = {
            'ball-yellow': '#FFD700',
            'ball-blue': '#0066FF',
            'ball-red': '#FF0000',
            'ball-gray': '#808080',
            'ball-green': '#00CC00'
        };
        
        const ballClass = getBallClass(num);
        const bgColor = bgColors[ballClass] || '#808080';
        const textColor = getComplementaryColor(bgColor);
        
        // 인라인 스타일로 보색 적용
        ball.style.color = textColor;
    }
    ball.style.width = `${size}px`;
    ball.style.height = `${size}px`;
    ball.style.fontSize = fontSize;
    ball.textContent = num;
    return ball;
}

/**
 * 플러스 기호 생성
 */
function createPlusSign(style = "color: #ffd54f; font-weight: bold; margin: 0 2px;") {
    const plus = document.createElement("span");
    plus.style.cssText = style;
    plus.textContent = "+";
    return plus;
}
/** 단일 번들: 필수 함수는 이미 로드됨 */
async function waitForRequiredFunctions() {
    return true;
}

/**
 * 애플리케이션 초기화 함수
 */
async function initializeApp() {
    console.log('[로또] 앱 초기화 시작');
    const statsListEl = document.getElementById('statsList');
    const viewNumbersListEl = document.getElementById('viewNumbersList');
    const setLoadError = (msg) => {
        if (statsListEl) statsListEl.innerHTML = '<p class="load-error">' + msg + '</p>';
        if (viewNumbersListEl) viewNumbersListEl.innerHTML = '<p class="load-error">' + msg + '</p>';
    };

    try {
        if (typeof XLSX === 'undefined') {
            setLoadError('XLSX 라이브러리를 불러올 수 없습니다. 인터넷 연결과 스크립트를 확인해 주세요.');
            alert('SheetJS(XLSX) 라이브러리가 로드되지 않았습니다. 페이지를 새로고침하거나 인터넷 연결을 확인해 주세요.');
            return;
        }

        // 필수 함수가 로드될 때까지 대기
        await waitForRequiredFunctions();
        
        // 함수 참조 가져오기 (window 객체 또는 전역 스코프)
        const loadFunc = (typeof window !== 'undefined' && window.loadLotto645Data) 
            ? window.loadLotto645Data 
            : (typeof loadLotto645Data !== 'undefined' ? loadLotto645Data : null);
        
        if (!loadFunc || typeof loadFunc !== 'function') {
            throw new Error('loadLotto645Data 함수에 접근할 수 없습니다.');
        }
        
        // XLSX 파일에서 데이터 로드 (서버 경로: /source/Lotto645.xlsx)
        const lotto645Data = await loadFunc();
        console.log('[로또] Lotto645 데이터:', lotto645Data.length, '건');
        if (lotto645Data.length === 0) {
            const errMsg = 'XLSX 파일을 불러올 수 없습니다. 서버를 실행한 뒤 접속해 주세요. (start-server.bat 또는 python server.py)';
            setLoadError(errMsg);
            alert(errMsg);
            return;
        }
        
        // 통계 초기화
        initializeStats(lotto645Data);
        console.log('[로또] 앱 초기화 완료');
        
        // 날짜 입력 필드 초기값 설정
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');
        const selectBtn = document.getElementById('selectDateRangeBtn');
        
        if (startDateInput && endDateInput && lotto645Data.length > 0) {
            // 1회차 날짜 찾기 (가장 오래된 회차)
            const firstRound = lotto645Data[lotto645Data.length - 1];
            if (firstRound && firstRound.date) {
                const firstDate = parseDate(firstRound.date);
                startDateInput.value = formatDateYYMMDD(firstDate);
            }
            
            // CSV에 있는 가장 최근 회차 날짜를 종료일로 설정 (데이터 전체가 보이도록)
            const lastRound = lotto645Data[0];
            if (lastRound && lastRound.date) {
                const lastDate = parseDate(lastRound.date);
                endDateInput.value = formatDateYYMMDD(lastDate);
            } else {
                const today = new Date();
                endDateInput.value = formatDateYYMMDD(today);
            }
            
            // 날짜 입력 필드 포맷 자동 정리 (blur 시)
            startDateInput.addEventListener('blur', function() {
                const value = this.value.trim();
                if (!value) {
                    updateRoundDisplay();
                    return;
                }
                
                // 4자리 이내 숫자는 회차로 처리
                if (isRoundInput(value)) {
                    const roundNum = parseInt(value);
                    const dateStr = convertRoundToDate(value);
                    if (dateStr) {
                        this.value = dateStr;
                        updateRoundDisplay();
                        updateRoundRangeDisplay();
                        // 종료일과 비교 검증
                        if (!validateDateRange()) {
                            this.value = '';
                            updateRoundDisplay();
                            return;
                        }
                    } else {
                        // 실제 회차 번호로 에러 메시지 표시 (앞의 0 제거된 숫자)
                        alert(`회차 ${roundNum}에 해당하는 데이터가 없습니다.`);
                        this.value = '';
                        updateRoundDisplay();
                    }
                    return;
                }
                
                // 6자리 숫자는 날짜로 처리 → 해당 날짜를 포함하는 회차의 날짜로 변환
                if (/^\d{6}$/.test(value)) {
                    const isStartDate = this.id === 'startDate';
                    const roundDate = convertDateToRoundDate(value, isStartDate);
                    if (roundDate) {
                        this.value = roundDate;
                        updateRoundDisplay();
                        updateRoundRangeDisplay();
                        // 종료일과 비교 검증
                        if (!validateDateRange()) {
                            this.value = '';
                            updateRoundDisplay();
                            return;
                        }
                    } else {
                        alert(`${isStartDate ? '시작일' : '종료일'}에 해당하는 회차를 찾을 수 없습니다.`);
                        this.value = '';
                        updateRoundDisplay();
                    }
                    return;
                }
                
                // yy/mm/dd 형식인 경우
                const date = parseDate(value);
                if (date && date !== '000000' && date !== '999999') {
                    this.value = formatDateYYMMDD(date);
                    updateRoundDisplay();
                    updateRoundRangeDisplay();
                    // 종료일과 비교 검증
                    if (!validateDateRange()) {
                        this.value = '';
                        updateRoundDisplay();
                        return;
                    }
                } else {
                    alert('날짜 또는 회차 형식이 올바르지 않습니다.');
                    this.value = '';
                    updateRoundDisplay();
                }
            });
            
            endDateInput.addEventListener('blur', function() {
                const value = this.value.trim();
                if (!value) {
                    updateRoundDisplay();
                    return;
                }
                
                // 4자리 이내 숫자는 회차로 처리
                if (isRoundInput(value)) {
                    const roundNum = parseInt(value);
                    const dateStr = convertRoundToDate(value);
                    if (dateStr) {
                        this.value = dateStr;
                        updateRoundDisplay();
                        updateRoundRangeDisplay();
                        // 시작일과 비교 검증
                        if (!validateDateRange()) {
                            this.value = '';
                            updateRoundDisplay();
                            return;
                        }
                    } else {
                        // 실제 회차 번호로 에러 메시지 표시 (앞의 0 제거된 숫자)
                        alert(`회차 ${roundNum}에 해당하는 데이터가 없습니다.`);
                        this.value = '';
                        updateRoundDisplay();
                    }
                    return;
                }
                
                // 6자리 숫자는 날짜로 처리 → 해당 날짜를 포함하는 회차의 날짜로 변환
                if (/^\d{6}$/.test(value)) {
                    const isStartDate = this.id === 'startDate';
                    const roundDate = convertDateToRoundDate(value, isStartDate);
                    if (roundDate) {
                        this.value = roundDate;
                        updateRoundDisplay();
                        updateRoundRangeDisplay();
                        // 시작일과 비교 검증
                        if (!validateDateRange()) {
                            this.value = '';
                            updateRoundDisplay();
                            return;
                        }
                    } else {
                        alert(`${isStartDate ? '시작일' : '종료일'}에 해당하는 회차를 찾을 수 없습니다.`);
                        this.value = '';
                        updateRoundDisplay();
                    }
                    return;
                }
                
                // yy/mm/dd 형식인 경우
                const date = parseDate(value);
                if (date && date !== '000000' && date !== '999999') {
                    this.value = formatDateYYMMDD(date);
                    updateRoundDisplay();
                    updateRoundRangeDisplay();
                    // 시작일과 비교 검증
                    if (!validateDateRange()) {
                        this.value = '';
                        updateRoundDisplay();
                        return;
                    }
                } else {
                    alert('날짜 또는 회차 형식이 올바르지 않습니다.');
                    this.value = '';
                    updateRoundDisplay();
                }
            });
            
            // 입력 중에도 실시간으로 변환 (입력 완료 시)
            startDateInput.addEventListener('input', function() {
                const value = this.value.trim();
                
                // 4자리 이내 숫자 입력 완료 시 회차로 변환
                if (isRoundInput(value)) {
                    const dateStr = convertRoundToDate(value);
                    if (dateStr) {
                        setTimeout(() => {
                            if (this.value.trim() === value) {
                                this.value = dateStr;
                                updateRoundRangeDisplay();
                            }
                        }, 500); // 입력 완료 후 0.5초 뒤 변환
                    }
                    return;
                }
                
                // 6자리 숫자 입력 완료 시 날짜로 변환 → 해당 날짜를 포함하는 회차의 날짜로 변환
                if (/^\d{6}$/.test(value)) {
                    const isStartDate = this.id === 'startDate';
                    const roundDate = convertDateToRoundDate(value, isStartDate);
                    if (roundDate) {
                        setTimeout(() => {
                            if (this.value.trim() === value) {
                                this.value = roundDate;
                                updateRoundRangeDisplay();
                            }
                        }, 500);
                    }
                    return;
                }
                
                updateRoundDisplay();
                updateRoundRangeDisplay();
            });
            
            endDateInput.addEventListener('input', function() {
                const value = this.value.trim();
                
                // 4자리 이내 숫자 입력 완료 시 회차로 변환
                if (isRoundInput(value)) {
                    const dateStr = convertRoundToDate(value);
                    if (dateStr) {
                        setTimeout(() => {
                            if (this.value.trim() === value) {
                                this.value = dateStr;
                                updateRoundDisplay();
                                updateRoundRangeDisplay();
                            }
                        }, 500);
                    }
                    return;
                }
                
                // 6자리 숫자 입력 완료 시 날짜로 변환 → 해당 날짜를 포함하는 회차의 날짜로 변환
                if (/^\d{6}$/.test(value)) {
                    const isStartDate = this.id === 'startDate';
                    const roundDate = convertDateToRoundDate(value, isStartDate);
                    if (roundDate) {
                        setTimeout(() => {
                            if (this.value.trim() === value) {
                                this.value = roundDate;
                                updateRoundDisplay();
                                updateRoundRangeDisplay();
                            }
                        }, 500);
                    }
                    return;
                }
                
                updateRoundDisplay();
                updateRoundRangeDisplay();
            });
            
            
            // 초기 회차 범위 표시
            updateRoundDisplay();
            updateRoundRangeDisplay();
            
            // 선택 버튼 클릭 시 날짜 필터링 적용
            if (selectBtn) {
                selectBtn.addEventListener('click', () => {
                    updateStatsByDateRange();
                });
            }
        }
        
        // 초기 렌더링 (전체 데이터로 표시, 선택 버튼 클릭 전까지)
        renderStats(lotto645Data);
        
        // 기본 정렬을 번호순으로 설정
        AppState.currentSort = 'number-asc';
        updateSortButtons('number');
        
        // 게임박스 초기화
        initializeGameBox();
        
        // 정렬 버튼 설정
        setupSortButtons();
        
        // 초기 정렬 상태 반영
        renderStatsList();
        renderNumberGrid();
        
        // 필터 이벤트 리스너 설정
        setupFilterListeners();
        
        // 저장 버튼 이벤트 리스너 설정
        setupSaveButton();
        
        // 결과박스 초기 로드
        loadAndDisplayResults();
        
        // 애플리케이션 초기화 완료 이벤트 발생 (다른 스크립트에서 사용 가능)
        if (typeof window.onAppInitialized === 'function') {
            window.onAppInitialized();
        }
    } catch (error) {
        alert('애플리케이션 초기화 중 오류가 발생했습니다: ' + error.message);
    }
}

/**
 * 선택공 그리드 렌더링 함수 (정렬에 따라)
 */
function renderNumberGrid() {
    const centerPanel = document.querySelector('.center-panel');
    if (!centerPanel || !AppState || !AppState.winStats || AppState.winStats.length === 0) {
        return;
    }
    
    // 현재 정렬 방식에 따라 데이터 정렬
    let sortedStats = [...AppState.winStats];
    
    // 당첨통계의 정렬 방식에 따라 선택공 그리드 정렬
    if (AppState.currentSort === 'win-desc') {
        // 당첨순▼: 내림차순
        sortedStats.sort((a, b) => b.count - a.count);
    } else if (AppState.currentSort === 'win-asc') {
        // 당첨순▲: 오름차순
        sortedStats.sort((a, b) => a.count - b.count);
    } else if (AppState.currentSort === 'appearance-desc') {
        // 출현순▼: 보너스 포함, 내림차순
        sortedStats = Array.from(AppState.appearanceStatsMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => b.count - a.count);
    } else if (AppState.currentSort === 'appearance-asc') {
        // 출현순▲: 보너스 포함, 오름차순
        sortedStats = Array.from(AppState.appearanceStatsMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => a.count - b.count);
    } else if (AppState.currentSort === 'number-desc') {
        // 번호순▼: 내림차순
        sortedStats.sort((a, b) => b.number - a.number);
    } else if (AppState.currentSort === 'number-asc') {
        // 번호순▲: 오름차순
        sortedStats.sort((a, b) => a.number - b.number);
    } else {
        // 기본: 번호순 오름차순
        sortedStats.sort((a, b) => a.number - b.number);
    }
    
    // 헤더 컨테이너 찾기 또는 생성
    let headerContainer = document.getElementById('numberGridHeaderContainer');
    if (!headerContainer) {
        headerContainer = document.createElement('div');
        headerContainer.id = 'numberGridHeaderContainer';
        headerContainer.style.display = 'flex';
        headerContainer.style.alignItems = 'center';
        headerContainer.style.justifyContent = 'space-between';
        headerContainer.style.marginBottom = '6px';
        headerContainer.style.gap = '16px';
        centerPanel.insertBefore(headerContainer, centerPanel.firstChild);
    }
    
    // 선택공 헤더 생성
    let title = headerContainer.querySelector('h2');
    if (!title) {
        title = document.createElement('h2');
        title.textContent = '선택공';
        title.style.textAlign = 'left';
        title.style.margin = '0';
        title.style.marginBottom = 'clamp(8px, 1.5vw, 12px)';
        title.style.padding = '0';
        title.style.fontSize = 'clamp(1.1rem, 2.5vw, 1.3rem)';
        title.style.color = '#000000';
        title.style.fontWeight = '600';
        title.style.lineHeight = '1.2';
        title.style.flex = '0 0 auto';
        title.style.minHeight = 'auto';
        headerContainer.appendChild(title);
    } else {
        // 기존 헤더 스타일 업데이트
        title.style.margin = '0';
        title.style.marginBottom = 'clamp(8px, 1.5vw, 12px)';
        title.style.padding = '0';
        title.style.fontSize = 'clamp(1.1rem, 2.5vw, 1.3rem)';
        title.style.lineHeight = '1.2';
        title.style.minHeight = 'auto';
    }
    
    // 필터 박스를 헤더 컨테이너로 이동
    const filterBox = document.getElementById('filterBox');
    if (filterBox && filterBox.parentElement !== headerContainer) {
        filterBox.style.display = 'flex';
        filterBox.style.flex = '0 0 auto';
        filterBox.style.marginBottom = '0';
        filterBox.style.width = '400px';
        filterBox.style.minWidth = '400px';
        filterBox.style.maxWidth = '400px';
        filterBox.style.padding = 'clamp(2px, 0.5vw, 4px) clamp(4px, 0.8vw, 6px)';
        filterBox.style.marginLeft = 'auto';
        filterBox.style.minHeight = '0';
        headerContainer.appendChild(filterBox);
    } else if (filterBox) {
        // 이미 이동된 경우에도 스타일 적용
        filterBox.style.width = '400px';
        filterBox.style.minWidth = '400px';
        filterBox.style.maxWidth = '400px';
        filterBox.style.padding = 'clamp(2px, 0.5vw, 4px) clamp(4px, 0.8vw, 6px)';
        filterBox.style.marginLeft = 'auto';
        filterBox.style.minHeight = '0';
    }
    
    // 선택공 그리드 컨테이너 찾기 또는 생성
    let gridContainer = document.querySelector('.number-grid-container');
    if (!gridContainer) {
        gridContainer = document.createElement('div');
        gridContainer.className = 'number-grid-container';
        gridContainer.style.width = '100%';
        gridContainer.style.margin = '0 auto';
        
        if (headerContainer && headerContainer.nextSibling) {
            centerPanel.insertBefore(gridContainer, headerContainer.nextSibling);
        } else {
            centerPanel.appendChild(gridContainer);
        }
    } else {
        gridContainer.innerHTML = '';
    }
    
    // 9x5 그리드로 고정 (9열 5행)
    gridContainer.style.display = 'grid';
    gridContainer.style.gridTemplateColumns = 'repeat(9, 1fr)';
    gridContainer.style.gap = 'clamp(3px, 0.8vw, 6px)';
    
    // 당첨순 상위 6개 번호 찾기 (정렬된 순서 기준)
    const sortedByWin = [...sortedStats].sort((a, b) => b.count - a.count);
    const top6Numbers = new Set(sortedByWin.slice(0, 6).map(s => s.number));
    
    // 정렬된 순서대로 선택공 그리드에 배치
    // 모든 번호(1~45)가 포함되도록 보장
    const allNumbersSet = new Set(Array.from({ length: 45 }, (_, i) => i + 1));
    const sortedNumbers = sortedStats.map(s => s.number);
    
    // 정렬된 번호에 없는 번호들 추가 (통계가 0인 경우)
    allNumbersSet.forEach(num => {
        if (!sortedNumbers.includes(num)) {
            sortedNumbers.push(num);
        }
    });
    
    // 정렬된 순서대로 그리드에 배치
    sortedNumbers.forEach((number) => {
        // 해당 번호의 통계 정보 찾기
        const stat = sortedStats.find(s => s.number === number) || { number, count: 0 };
        
        const ball = createStatBall(stat.number, 24, '0.9rem');
        ball.style.cursor = 'pointer';
        ball.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease';
        
        // 당첨순 상위 6개는 검정색 테두리 (0.2px)
        if (top6Numbers.has(stat.number)) {
            ball.style.border = '0.2px solid #000000';
            ball.style.boxShadow = '0 0 0 1px rgba(0, 0, 0, 0.1)';
        }
        
        // 공 클릭 이벤트 추가
        ball.addEventListener('click', () => {
            if (currentSelectingGameIndex !== null && currentSelectingBallIndex !== null) {
                // 수동 모드 선택 중이면 번호 할당
                handleSelectBallClick(stat.number);
            } else {
                handleBallClick(stat.number);
            }
        });
        
        ball.addEventListener('mouseenter', () => {
            ball.style.transform = 'scale(1.1)';
            ball.style.boxShadow = '0 4px 8px rgba(0, 0, 0, 0.2)';
        });
        ball.addEventListener('mouseleave', () => {
            ball.style.transform = 'scale(1)';
            if (top6Numbers.has(stat.number)) {
                ball.style.boxShadow = '0 0 0 1px rgba(0, 0, 0, 0.1)';
            } else {
                ball.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.1)';
            }
        });
        gridContainer.appendChild(ball);
    });
}

/**
 * 통계 리스트 렌더링 함수
 */
function renderStatsList() {
    const statsList = document.getElementById('statsList');
    if (!statsList || !AppState || !AppState.winStats || AppState.winStats.length === 0) {
        return;
    }
    
    // 현재 정렬 방식에 따라 데이터 정렬
    let sortedStats = [...AppState.winStats];
    let percentageMap = AppState.winPercentageCache || new Map();
    
    if (AppState.currentSort === 'win-desc') {
        // 당첨순▼: 보너스 제외, 내림차순
        sortedStats.sort((a, b) => b.count - a.count);
        percentageMap = AppState.winPercentageCache || new Map();
    } else if (AppState.currentSort === 'win-asc') {
        // 당첨순▲: 보너스 제외, 오름차순
        sortedStats.sort((a, b) => a.count - b.count);
        percentageMap = AppState.winPercentageCache || new Map();
    } else if (AppState.currentSort === 'appearance-desc') {
        // 출현순▼: 보너스 포함, 내림차순
        sortedStats = Array.from(AppState.appearanceStatsMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => b.count - a.count);
        percentageMap = AppState.appearancePercentageCache || new Map();
    } else if (AppState.currentSort === 'appearance-asc') {
        // 출현순▲: 보너스 포함, 오름차순
        sortedStats = Array.from(AppState.appearanceStatsMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => a.count - b.count);
        percentageMap = AppState.appearancePercentageCache || new Map();
    } else if (AppState.currentSort === 'number-desc') {
        // 번호순▼: 내림차순
        sortedStats.sort((a, b) => b.number - a.number);
        percentageMap = AppState.winPercentageCache || new Map();
    } else if (AppState.currentSort === 'number-asc') {
        // 번호순▲: 오름차순
        sortedStats.sort((a, b) => a.number - b.number);
        percentageMap = AppState.winPercentageCache || new Map();
    } else {
        // 기본: 번호순▼
        sortedStats.sort((a, b) => b.number - a.number);
        percentageMap = AppState.winPercentageCache || new Map();
    }
    
    // 리스트 렌더링
    statsList.innerHTML = '';
    sortedStats.forEach(stat => {
        const statLine = document.createElement('div');
        statLine.className = 'stat-line';
        statLine.style.display = 'flex';
        statLine.style.alignItems = 'center';
        statLine.style.gap = '8px';
        statLine.style.padding = '0 8px';
        statLine.style.height = '28px';
        statLine.style.minHeight = '28px';
        statLine.style.boxSizing = 'border-box';
        
        // 공
        const ball = createStatBall(stat.number, 24, '0.9rem');
        
        // 통계 정보 (우측 정렬)
        const statInfo = document.createElement('div');
        statInfo.style.marginLeft = 'auto';
        statInfo.style.display = 'flex';
        statInfo.style.alignItems = 'center';
        statInfo.style.gap = '8px';
        statInfo.style.fontSize = '0.9rem';
        
        const count = document.createElement('span');
        count.style.color = '#000000';
        count.textContent = `${stat.count}`;
        
        const countUnit = document.createElement('span');
        countUnit.style.color = '#000000';
        countUnit.style.fontWeight = '700';
        countUnit.textContent = '회';
        
        const percentage = percentageMap.get(stat.number) || 0;
        const percent = document.createElement('span');
        percent.style.color = '#666666';
        percent.textContent = `(${percentage.toFixed(2)}%)`;
        
        statInfo.appendChild(count);
        statInfo.appendChild(countUnit);
        statInfo.appendChild(percent);
        
        statLine.appendChild(ball);
        statLine.appendChild(statInfo);
        statsList.appendChild(statLine);
    });
}

/**
 * 게임박스 초기화
 */
function initializeGameBox() {
    const gameSetsContainer = document.getElementById('gameSetsContainer');
    if (!gameSetsContainer) return;
    
    gameSetsContainer.innerHTML = '';
    
    // 1~5게임 생성
    for (let i = 1; i <= 5; i++) {
        const gameSet = document.createElement('div');
        gameSet.id = `gameSet${i}`;
        gameSet.style.display = 'flex';
        gameSet.style.alignItems = 'center';
        gameSet.style.gap = '2px';
        gameSet.style.padding = '0';
        gameSet.style.border = 'none';
        gameSet.style.borderRadius = '0';
        gameSet.style.backgroundColor = 'transparent';
        
        // 게임 번호
        const gameNumber = document.createElement('span');
        gameNumber.textContent = `${i}게임`;
        gameNumber.style.fontSize = '0.85rem';
        gameNumber.style.fontWeight = '600';
        gameNumber.style.minWidth = '50px';
        gameNumber.style.color = '#000000';
        gameNumber.style.flexShrink = '0';
        
        // 자동/반자동/수동 토글 버튼 (너비 80px)
        const modeBtn = document.createElement('button');
        modeBtn.id = `modeBtn${i}`;
        modeBtn.className = 'filter-btn';
        modeBtn.textContent = '자동';
        modeBtn.style.width = '80px';
        modeBtn.dataset.gameIndex = i;
        modeBtn.dataset.mode = 'auto';
        modeBtn.style.flexShrink = '0';
        
        modeBtn.addEventListener('click', function() {
            const currentMode = this.dataset.mode;
            let newMode, newText;
            if (currentMode === 'auto') {
                newMode = 'semi-auto';
                newText = '반자동';
            } else if (currentMode === 'semi-auto') {
                newMode = 'manual';
                newText = '수동';
            } else {
                newMode = 'auto';
                newText = '자동';
            }
            this.dataset.mode = newMode;
            this.textContent = newText;
            updateGameSet(i, newMode);
        });
        
        // 게임공 컨테이너 (한 라인으로, 스크롤 없음)
        const ballsContainer = document.createElement('div');
        ballsContainer.id = `gameBalls${i}`;
        ballsContainer.style.display = 'flex';
        ballsContainer.style.gap = '20px';
        ballsContainer.style.flex = '1';
        ballsContainer.style.flexWrap = 'nowrap';
        ballsContainer.style.minHeight = '24px';
        ballsContainer.style.overflowX = 'hidden';
        ballsContainer.style.overflowY = 'hidden';
        
        // 체크박스
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = `gameCheckbox${i}`;
        checkbox.dataset.gameIndex = i;
        checkbox.style.flexShrink = '0';
        checkbox.style.marginLeft = 'auto';
        checkbox.addEventListener('change', function() {
            const gameIndex = parseInt(this.dataset.gameIndex);
            const modeBtn = document.getElementById(`modeBtn${gameIndex}`);
            const currentMode = modeBtn ? modeBtn.dataset.mode : 'auto';
            
            if (this.checked) {
                // 체크박스 체크 시
                if (currentMode === 'auto') {
                    // 자동 모드: 이미 체크되어 있음
                } else if (currentMode === 'manual') {
                    // 수동 모드: 6개 모두 선택되었는지 확인
                    const numbers = AppState.setSelectedBalls[gameIndex - 1] || [];
                    const validNumbers = numbers.filter(n => n && n >= 1 && n <= 45);
                    if (validNumbers.length !== 6) {
                        alert('6개의 번호를 모두 선택해주세요.');
                        this.checked = false;
                        return;
                    }
                }
            } else {
                // 체크박스 해제 시
                if (currentMode === 'auto') {
                    // 자동 모드: 옵션필터 조건으로 게임공 재생성
                    generateGame(gameIndex, 'auto');
                } else if (currentMode === 'manual') {
                    // 수동 모드: 선택공 초기화
                    if (!AppState.setSelectedBalls) {
                        AppState.setSelectedBalls = Array.from({ length: 5 }, () => []);
                    }
                    AppState.setSelectedBalls[gameIndex - 1] = [];
                    updateGameSet(gameIndex, 'manual');
                } else if (currentMode === 'semi-auto') {
                    // 반자동 모드: 체크박스만 해제
                }
            }
            
            updateSaveBoxState();
        });
        
        // 합계 표시 영역
        const sumDisplay = document.createElement('span');
        sumDisplay.id = `gameSum${i}`;
        sumDisplay.textContent = ' [ 0 ]';
        sumDisplay.style.fontSize = '0.85rem';
        sumDisplay.style.color = '#ff0000';
        sumDisplay.style.fontWeight = 'bold';
        sumDisplay.style.textAlign = 'left';
        sumDisplay.style.flexShrink = '0';
        sumDisplay.style.minWidth = '80px';
        
        gameSet.appendChild(gameNumber);
        gameSet.appendChild(modeBtn);
        gameSet.appendChild(sumDisplay);
        gameSet.appendChild(ballsContainer);
        gameSet.appendChild(checkbox);
        
        gameSetsContainer.appendChild(gameSet);
    }
    
    // 초기 게임 생성
    generateAllGames();
}

/**
 * 정렬 버튼 설정
 */
function setupSortButtons() {
    const sortNumberBtn = document.getElementById('sortNumber');
    const sortWinBtn = document.getElementById('sortWin');
    const sortAppearanceBtn = document.getElementById('sortAppearance');
    
    if (sortNumberBtn) {
        sortNumberBtn.addEventListener('click', () => {
            if (AppState.currentSort === 'number-desc') {
                AppState.currentSort = 'number-asc';
                sortNumberBtn.textContent = '번호순▲';
            } else {
                AppState.currentSort = 'number-desc';
                sortNumberBtn.textContent = '번호순▼';
            }
            updateSortButtons('number');
            renderStatsList();
            renderNumberGrid();
        });
    }
    
    if (sortWinBtn) {
        sortWinBtn.addEventListener('click', () => {
            if (AppState.currentSort === 'win-desc') {
                AppState.currentSort = 'win-asc';
                sortWinBtn.textContent = '당첨순▲';
            } else {
                AppState.currentSort = 'win-desc';
                sortWinBtn.textContent = '당첨순▼';
            }
            updateSortButtons('win');
            renderStatsList();
            renderNumberGrid();
        });
    }
    
    if (sortAppearanceBtn) {
        sortAppearanceBtn.addEventListener('click', () => {
            if (AppState.currentSort === 'appearance-desc') {
                AppState.currentSort = 'appearance-asc';
                sortAppearanceBtn.textContent = '출현순▲';
            } else {
                AppState.currentSort = 'appearance-desc';
                sortAppearanceBtn.textContent = '출현순▼';
            }
            updateSortButtons('appearance');
            renderStatsList();
            renderNumberGrid();
        });
    }
}

/**
 * 정렬 버튼 활성화 상태 업데이트
 */
function updateSortButtons(activeType) {
    const sortNumberBtn = document.getElementById('sortNumber');
    const sortWinBtn = document.getElementById('sortWin');
    const sortAppearanceBtn = document.getElementById('sortAppearance');
    
    [sortNumberBtn, sortWinBtn, sortAppearanceBtn].forEach(btn => {
        if (btn) {
            btn.classList.remove('active');
        }
    });
    
    if (activeType === 'number' && sortNumberBtn) {
        sortNumberBtn.classList.add('active');
    } else if (activeType === 'win' && sortWinBtn) {
        sortWinBtn.classList.add('active');
    } else if (activeType === 'appearance' && sortAppearanceBtn) {
        sortAppearanceBtn.classList.add('active');
    }
}

/**
 * 필터 리스너 설정
 */
function setupFilterListeners() {
    const oddEvenFilter = document.getElementById('oddEvenFilter');
    const sequenceFilter = document.getElementById('sequenceFilter');
    const hotColdFilter = document.getElementById('hotColdFilter');
    const modeFilter = document.getElementById('modeFilter');
    
    if (oddEvenFilter) {
        oddEvenFilter.addEventListener('change', () => {
            generateAllGames();
        });
    }
    
    if (sequenceFilter) {
        sequenceFilter.addEventListener('change', () => {
            generateAllGames();
        });
    }
    
    if (hotColdFilter) {
        hotColdFilter.addEventListener('change', () => {
            generateAllGames();
        });
    }
    
    if (modeFilter) {
        modeFilter.addEventListener('change', () => {
            const mode = modeFilter.value;
            
            if (mode === 'select') {
                // "선택" 모드: 모든 게임을 수동으로 설정, 게임공/체크 리셋, 게임박스 비활성화
                for (let i = 1; i <= 5; i++) {
                    const modeBtn = document.getElementById(`modeBtn${i}`);
                    const gameSet = document.querySelector(`#gameSetsContainer > div:nth-child(${i})`);
                    const checkbox = document.getElementById(`gameCheckbox${i}`);
                    
                    if (modeBtn) {
                        modeBtn.dataset.mode = 'manual';
                        modeBtn.textContent = '수동';
                    }
                    
                    // 게임공 초기화
                    if (!AppState.setSelectedBalls) {
                        AppState.setSelectedBalls = Array.from({ length: 5 }, () => []);
                    }
                    AppState.setSelectedBalls[i - 1] = [];
                    
                    // 체크박스 해제
                    if (checkbox) {
                        checkbox.checked = false;
                    }
                    
                    // 게임박스 비활성화
                    if (gameSet) {
                        gameSet.style.opacity = '0.5';
                        gameSet.style.pointerEvents = 'none';
                    }
                    
                    updateGameSet(i, 'manual');
                }
            } else {
                // "자동" 또는 "수동" 모드: 게임박스 활성화, 옵션필터 조건으로 게임공 출력
                for (let i = 1; i <= 5; i++) {
                    const gameSet = document.querySelector(`#gameSetsContainer > div:nth-child(${i})`);
                    const modeBtn = document.getElementById(`modeBtn${i}`);
                    
                    // 게임박스 활성화
                    if (gameSet) {
                        gameSet.style.opacity = '1';
                        gameSet.style.pointerEvents = 'auto';
                    }
                    
                    // 옵션필터 조건으로 게임공 출력
                    if (mode === 'auto') {
                        if (modeBtn) {
                            modeBtn.dataset.mode = 'auto';
                            modeBtn.textContent = '자동';
                        }
                        updateGameSet(i, 'auto');
                    } else if (mode === 'manual') {
                        if (modeBtn) {
                            modeBtn.dataset.mode = 'manual';
                            modeBtn.textContent = '수동';
                        }
                        updateGameSet(i, 'manual');
                    }
                }
            }
            
            updateSaveBoxState();
        });
    }
}

/**
 * 공 클릭 핸들러 (선택공 그리드)
 */
function handleBallClick(number) {
    const modeFilter = document.getElementById('modeFilter');
    if (!modeFilter || modeFilter.value !== 'select') return;
    
    // 선택 모드에서는 선택공 그리드의 공을 클릭해도 동작하지 않음
    // 수동 모드의 게임공 클릭만 처리
}

/**
 * 현재 선택 중인 게임 인덱스와 공 인덱스
 */
let currentSelectingGameIndex = null;
let currentSelectingBallIndex = null;

/**
 * 수동 모드 게임공 클릭 핸들러
 */
function handleManualBallClick(gameIndex, ballIndex) {
    const modeFilter = document.getElementById('modeFilter');
    if (!modeFilter) return;
    
    // 선택 모드일 때만 수동 선택 가능
    if (modeFilter.value !== 'select') {
        // 선택 모드가 아니면 해당 게임의 모드 버튼 확인
        const modeBtn = document.getElementById(`modeBtn${gameIndex}`);
        if (!modeBtn || modeBtn.dataset.mode !== 'manual') {
            return;
        }
    }
    
    // 이미 번호가 있으면 삭제
    if (!AppState.setSelectedBalls) {
        AppState.setSelectedBalls = Array.from({ length: 5 }, () => []);
    }
    if (!AppState.setSelectedBalls[gameIndex - 1]) {
        AppState.setSelectedBalls[gameIndex - 1] = [];
    }
    
    if (AppState.setSelectedBalls[gameIndex - 1][ballIndex]) {
        // 번호 삭제
        AppState.setSelectedBalls[gameIndex - 1][ballIndex] = undefined;
        // 배열 정리
        AppState.setSelectedBalls[gameIndex - 1] = AppState.setSelectedBalls[gameIndex - 1].filter(n => n);
        const modeBtn = document.getElementById(`modeBtn${gameIndex}`);
        const currentMode = modeBtn ? modeBtn.dataset.mode : 'manual';
        const numbers = AppState.setSelectedBalls[gameIndex - 1] || [];
        updateGameSet(gameIndex, currentMode);
        // 합계 업데이트 (updateGameSet 내부에서도 하지만, 여기서도 명시적으로)
        updateGameSum(gameIndex, numbers);
        return;
    }
    
    // 선택 모드일 때 게임공 클릭 시 선택 대기 상태로 설정
    currentSelectingGameIndex = gameIndex;
    currentSelectingBallIndex = ballIndex;
    
    // 선택공 그리드의 공에 선택 가능 표시
    const gridBalls = document.querySelectorAll('.number-grid-container .stat-ball');
    gridBalls.forEach(ball => {
        ball.style.opacity = '1';
        ball.style.cursor = 'pointer';
        ball.style.transform = 'scale(1)';
    });
    
    // 선택 중인 게임공 하이라이트
    const selectingBall = document.querySelector(`#gameBalls${gameIndex} > div:nth-child(${ballIndex + 1})`);
    if (selectingBall) {
        selectingBall.style.border = '2px solid #0066ff';
        selectingBall.style.boxShadow = '0 0 8px rgba(0, 102, 255, 0.5)';
    }
}

/**
 * 선택공 그리드의 공 클릭 핸들러 (수동/반자동 모드용)
 */
function handleSelectBallClick(number) {
    if (currentSelectingGameIndex === null || currentSelectingBallIndex === null) {
        return;
    }
    
    // 같은 게임에 이미 선택된 번호인지 확인
    if (!AppState.setSelectedBalls) {
        AppState.setSelectedBalls = Array.from({ length: 5 }, () => []);
    }
    if (!AppState.setSelectedBalls[currentSelectingGameIndex - 1]) {
        AppState.setSelectedBalls[currentSelectingGameIndex - 1] = [];
    }
    
    const currentNumbers = AppState.setSelectedBalls[currentSelectingGameIndex - 1] || [];
    // 이미 선택된 번호면 다른 위치에 있는 경우에만 교체 불가 (중복 방지)
    if (currentNumbers.includes(number) && currentNumbers[currentSelectingBallIndex] !== number) {
        alert('이미 선택된 번호입니다.');
        return;
    }
    
    AppState.setSelectedBalls[currentSelectingGameIndex - 1][currentSelectingBallIndex] = number;
    
    // 모드 버튼 확인하여 모드 결정
    const modeBtn = document.getElementById(`modeBtn${currentSelectingGameIndex}`);
    const currentMode = modeBtn ? modeBtn.dataset.mode : 'manual';
    
    // 반자동 모드인 경우 선택공으로 교체
    if (currentMode === 'semi-auto') {
        const selectingBall = document.querySelector(`#gameBalls${currentSelectingGameIndex} > div:nth-child(${currentSelectingBallIndex + 1})`);
        if (selectingBall) {
            // 선택공으로 교체
            const newBall = createStatBall(number, 24, '0.9rem');
            newBall.style.cursor = 'pointer';
            newBall.dataset.gameIndex = currentSelectingGameIndex;
            newBall.dataset.ballIndex = currentSelectingBallIndex;
            newBall.dataset.isSelected = 'true';
            newBall.addEventListener('click', () => {
                // 반자동 모드: 게임공 클릭 시 흰색바탕 검정폰트로 변경
                newBall.style.backgroundColor = '#ffffff';
                newBall.style.color = '#000000';
                newBall.style.border = '2px solid #000000';
                newBall.dataset.isSelected = 'false';
                // 선택 대기 상태로 설정
                currentSelectingGameIndex = currentSelectingGameIndex;
                currentSelectingBallIndex = currentSelectingBallIndex;
            });
            selectingBall.replaceWith(newBall);
        }
        // 반자동 모드 합계 업데이트
        const numbers = AppState.setSelectedBalls[currentSelectingGameIndex - 1] || [];
        updateGameSum(currentSelectingGameIndex, numbers);
    } else {
        updateGameSet(currentSelectingGameIndex, currentMode);
    }
    
    // 수동 모드에서 6개 모두 선택되면 체크박스 체크
    if (currentMode === 'manual') {
        const allNumbers = AppState.setSelectedBalls[currentSelectingGameIndex - 1] || [];
        const validNumbers = allNumbers.filter(n => n && n >= 1 && n <= 45);
        if (validNumbers.length === 6) {
            const checkbox = document.getElementById(`gameCheckbox${currentSelectingGameIndex}`);
            if (checkbox) {
                checkbox.checked = true;
            }
        }
    }
    
    // 선택 상태 초기화
    currentSelectingGameIndex = null;
    currentSelectingBallIndex = null;
    
    // 하이라이트 제거
    const allGameBalls = document.querySelectorAll('[id^="gameBalls"] > div');
    allGameBalls.forEach(ball => {
        ball.style.border = '';
        ball.style.boxShadow = '';
    });
}

/**
 * 게임 생성 (필터 적용)
 */
function generateAllGames() {
    for (let i = 1; i <= 5; i++) {
        const modeBtn = document.getElementById(`modeBtn${i}`);
        if (modeBtn) {
            const mode = modeBtn.dataset.mode || 'auto';
            generateGame(i, mode);
        }
    }
}

/**
 * 개별 게임 생성
 */
function generateGame(gameIndex, mode) {
    const ballsContainer = document.getElementById(`gameBalls${gameIndex}`);
    if (!ballsContainer) return;
    
    ballsContainer.innerHTML = '';
    
    if (mode === 'auto') {
        // 자동 모드: 필터 적용하여 완전 자동 생성
        const numbers = generateNumbersWithFilters();
        
        // 게임공 표시
        numbers.forEach(num => {
            const ball = createStatBall(num, 24, '0.9rem');
            ballsContainer.appendChild(ball);
        });
        
        // AppState에 저장
        if (!AppState.setSelectedBalls) {
            AppState.setSelectedBalls = Array.from({ length: 5 }, () => []);
        }
        AppState.setSelectedBalls[gameIndex - 1] = numbers;
        
        // 체크박스 자동 체크
        const checkbox = document.getElementById(`gameCheckbox${gameIndex}`);
        if (checkbox) {
            checkbox.checked = true;
            checkbox.disabled = false; // 체크박스만 활성화
        }
        
        // 게임공 비활성화 (클릭 불가)
        const gameBalls = ballsContainer.querySelectorAll('.stat-ball');
        gameBalls.forEach(ball => {
            ball.style.pointerEvents = 'none';
            ball.style.cursor = 'default';
        });
        
        // 합계 업데이트
        updateGameSum(gameIndex, numbers);
    } else if (mode === 'semi-auto') {
        // 반자동 모드: 기존 선택된 번호를 유지하고 나머지만 자동 생성
        if (!AppState.setSelectedBalls) {
            AppState.setSelectedBalls = Array.from({ length: 5 }, () => []);
        }
        let existingNumbers = AppState.setSelectedBalls[gameIndex - 1] || [];
        existingNumbers = existingNumbers.filter(n => n && n >= 1 && n <= 45);
        const remainingCount = 6 - existingNumbers.length;
        
        let allNumbers = [...existingNumbers];
        
        if (remainingCount > 0) {
            // 나머지 번호 자동 생성 (필터 적용, 기존 번호 제외)
            const fullNumbers = generateNumbersWithFilters(existingNumbers);
            // 기존 번호를 포함한 전체 번호에서 새로 추가된 번호만 추출
            const newNumbers = fullNumbers.filter(n => !existingNumbers.includes(n));
            allNumbers = [...existingNumbers, ...newNumbers].slice(0, 6);
            AppState.setSelectedBalls[gameIndex - 1] = allNumbers.sort((a, b) => a - b);
        } else {
            AppState.setSelectedBalls[gameIndex - 1] = allNumbers.sort((a, b) => a - b);
        }
        
        // 반자동 모드: 옵션필터 조건으로 게임공 출력, 체크박스 초기화
        const numbers = AppState.setSelectedBalls[gameIndex - 1] || [];
        
        // 체크박스 해제
        const checkbox = document.getElementById(`gameCheckbox${gameIndex}`);
        if (checkbox) {
            checkbox.checked = false;
            checkbox.disabled = false;
        }
        
        // 게임공 표시
        for (let i = 0; i < 6; i++) {
            if (numbers[i]) {
                const num = numbers[i];
                const ballElement = createStatBall(num, 24, '0.9rem');
                ballElement.style.cursor = 'pointer';
                ballElement.dataset.gameIndex = gameIndex;
                ballElement.dataset.ballIndex = i;
                ballElement.dataset.isSelected = 'true';
                ballElement.addEventListener('click', () => {
                    // 반자동 모드: 게임공 클릭 시 흰색바탕 검정폰트로 변경
                    ballElement.style.backgroundColor = '#ffffff';
                    ballElement.style.color = '#000000';
                    ballElement.style.border = '2px solid #000000';
                    ballElement.dataset.isSelected = 'false';
                    // 선택 대기 상태로 설정
                    currentSelectingGameIndex = gameIndex;
                    currentSelectingBallIndex = i;
                });
                ballsContainer.appendChild(ballElement);
            } else {
                const ball = document.createElement('div');
                ball.className = 'stat-ball';
                ball.style.width = '24px';
                ball.style.height = '24px';
                ball.style.borderRadius = '50%';
                ball.style.backgroundColor = '#e0e0e0';
                ball.style.color = '#666666';
                ball.style.display = 'flex';
                ball.style.alignItems = 'center';
                ball.style.justifyContent = 'center';
                ball.style.fontSize = '0.9rem';
                ball.style.fontWeight = '700';
                ball.style.cursor = 'pointer';
                ball.style.border = '0.2px solid #808080';
                ball.textContent = '?';
                ball.dataset.gameIndex = gameIndex;
                ball.dataset.ballIndex = i;
                ball.dataset.isSelected = 'false';
                ball.addEventListener('click', () => {
                    handleManualBallClick(gameIndex, i);
                });
                ballsContainer.appendChild(ball);
            }
        }
        
        // 합계 업데이트
        updateGameSum(gameIndex, numbers);
    } else if (mode === 'manual') {
        // 수동 모드: 검정바탕 흰색 폰트 공 표시
        if (!AppState.setSelectedBalls) {
            AppState.setSelectedBalls = Array.from({ length: 5 }, () => []);
        }
        const currentNumbers = AppState.setSelectedBalls[gameIndex - 1] || [];
        for (let i = 0; i < 6; i++) {
            const ball = document.createElement('div');
            ball.className = 'stat-ball';
            ball.style.width = '24px';
            ball.style.height = '24px';
            ball.style.borderRadius = '50%';
            ball.style.backgroundColor = '#000000';
            ball.style.color = '#ffffff';
            ball.style.display = 'flex';
            ball.style.alignItems = 'center';
            ball.style.justifyContent = 'center';
            ball.style.fontSize = '0.9rem';
            ball.style.fontWeight = '700';
            ball.style.cursor = 'pointer';
            ball.style.border = '0.2px solid #000000';
            
            if (currentNumbers[i]) {
                ball.textContent = currentNumbers[i];
            } else {
                ball.textContent = '?';
            }
            
            ball.dataset.gameIndex = gameIndex;
            ball.dataset.ballIndex = i;
            
            // 공 클릭 시 번호 선택 (선택 모드일 때만)
            ball.addEventListener('click', () => {
                handleManualBallClick(gameIndex, i);
            });
            
            ballsContainer.appendChild(ball);
        }
        
        // 합계 업데이트
        updateGameSum(gameIndex, currentNumbers);
    }
}

/**
 * 게임 합계 업데이트
 */
function updateGameSum(gameIndex, numbers) {
    const sumDisplay = document.getElementById(`gameSum${gameIndex}`);
    if (!sumDisplay) return;
    
    // 유효한 번호만 필터링하여 합계 계산
    const validNumbers = (numbers || []).filter(n => n && n >= 1 && n <= 45);
    const sum = validNumbers.reduce((acc, num) => acc + num, 0);
    
    sumDisplay.textContent = ` [ ${sum.toString().padStart(3, '0')} ]`;
}

/**
 * 필터를 적용하여 번호 생성
 */
function generateNumbersWithFilters(existingNumbers = []) {
    const oddEvenFilter = document.getElementById('oddEvenFilter')?.value || 'none';
    const sequenceFilter = document.getElementById('sequenceFilter')?.value || 'none';
    const hotColdFilter = document.getElementById('hotColdFilter')?.value || 'none';
    
    const candidate = pickSixWithFilters(oddEvenFilter, sequenceFilter, hotColdFilter, existingNumbers);
    
    if (candidate && candidate.length === 6) {
        return candidate;
    }
    
    // 필터 조건을 만족하지 못하면 기본 생성
    return pickSix();
}

/**
 * 필터를 적용한 번호 선택
 */
function pickSixWithFilters(oddEvenFilter, sequenceFilter, hotColdFilter, existingNumbers = []) {
    const maxAttempts = 1000;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
        // 기존 번호가 있으면 그것을 포함하여 선택
        let selected;
        if (existingNumbers.length > 0) {
            const remaining = 6 - existingNumbers.length;
            const pool = getAllNumbers().filter(n => !existingNumbers.includes(n));
            const shuffled = [...pool].sort(() => Math.random() - 0.5);
            selected = [...existingNumbers, ...shuffled.slice(0, remaining)];
        } else {
            selected = pickSix();
        }
        
        selected = selected.sort((a, b) => a - b);
        
        // 중복 제거 (기존 번호와 새 번호에 중복이 있을 수 있음)
        selected = [...new Set(selected)];
        if (selected.length < 6) {
            // 중복 제거 후 부족하면 추가 선택
            const pool = getAllNumbers().filter(n => !selected.includes(n));
            const shuffled = [...pool].sort(() => Math.random() - 0.5);
            selected = [...selected, ...shuffled.slice(0, 6 - selected.length)].slice(0, 6);
            selected = selected.sort((a, b) => a - b);
        }
        
        // 홀짝 비율 검증
        if (oddEvenFilter !== 'none') {
            const [targetOdd, targetEven] = oddEvenFilter.split('-').map(Number);
            const oddCount = selected.filter(n => n % 2 === 1).length;
            const evenCount = selected.filter(n => n % 2 === 0).length;
            
            if (oddCount !== targetOdd || evenCount !== targetEven) {
                continue;
            }
        }
        
        // 연속 검증
        if (sequenceFilter !== 'none') {
            const requiredPairs = parseInt(sequenceFilter);
            const pairs = countSequentialPairs(selected);
            if (pairs !== requiredPairs) {
                continue;
            }
        } else {
            // 연속없음: 연속이 없어야 함
            const pairs = countSequentialPairs(selected);
            if (pairs > 0) {
                continue;
            }
        }
        
        // 핫콜 비율 검증
        if (hotColdFilter !== 'none' && AppState && AppState.winStats) {
            const { hot, cold } = getHotColdNumbers();
            const [targetHot, targetCold] = hotColdFilter.split('-').map(Number);
            const hotSet = new Set(hot);
            const coldSet = new Set(cold);
            const hotCount = selected.filter(n => hotSet.has(n)).length;
            const coldCount = selected.filter(n => coldSet.has(n)).length;
            
            if (hotCount !== targetHot || coldCount !== targetCold) {
                continue;
            }
        }
        
        // 모든 조건을 만족하면 반환
        return selected;
    }
    
    // 조건을 만족하지 못하면 null 반환
    return null;
}

/**
 * 연속된 번호 쌍 개수 계산
 */
function countSequentialPairs(numbers) {
    const sorted = [...numbers].sort((a, b) => a - b);
    let count = 0;
    for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === sorted[i - 1] + 1) {
            count++;
        }
    }
    return count;
}

/**
 * 게임 세트 업데이트
 */
function updateGameSet(gameIndex, mode) {
    generateGame(gameIndex, mode);
}

/**
 * 저장박스 활성화 상태 업데이트
 */
function updateSaveBoxState() {
    const saveRound = document.getElementById('saveRound');
    const saveSet = document.getElementById('saveSet');
    const saveBtn = document.getElementById('saveBtn');
    
    if (!saveRound || !saveSet || !saveBtn) return;
    
    // 모든 체크박스가 체크되었는지 확인
    let allChecked = true;
    for (let i = 1; i <= 5; i++) {
        const checkbox = document.getElementById(`gameCheckbox${i}`);
        if (!checkbox || !checkbox.checked) {
            allChecked = false;
            break;
        }
    }
    
    // 저장박스 활성화/비활성화
    saveRound.disabled = !allChecked;
    saveSet.disabled = !allChecked;
    saveBtn.disabled = !allChecked;
}

/**
 * 저장 버튼 이벤트 리스너 설정
 */
function setupSaveButton() {
    const saveBtn = document.getElementById('saveBtn');
    if (!saveBtn) return;
    
    saveBtn.addEventListener('click', async () => {
        await saveGamesToCSV();
    });
}

/**
 * 게임을 CSV 파일에 저장
 */
async function saveGamesToCSV() {
    const saveRound = document.getElementById('saveRound');
    const saveSet = document.getElementById('saveSet');
    
    if (!saveRound || !saveSet) return;
    
    const round = parseInt(saveRound.value);
    const set = parseInt(saveSet.value);
    
    if (!round || round <= 0 || isNaN(round)) {
        alert('회차를 입력해주세요.');
        return;
    }
    
    if (set < 0 || isNaN(set)) {
        alert('세트는 0 이상이어야 합니다.');
        return;
    }
    
    // 최종회차(가장 최신 회차) 확인
    if (AppState && AppState.allLotto645Data && AppState.allLotto645Data.length > 0) {
        const latestRound = AppState.allLotto645Data[0].round;
        if (round <= latestRound) {
            alert(`회차는 최종회차(${latestRound}회) 당첨 이후여야 합니다.`);
            return;
        }
    }
    
    // 체크된 게임들만 저장
    const gamesToSave = [];
    for (let i = 1; i <= 5; i++) {
        const checkbox = document.getElementById(`gameCheckbox${i}`);
        if (checkbox && checkbox.checked) {
            const numbers = AppState.setSelectedBalls[i - 1] || [];
            // 6개 번호가 모두 있는지 확인
            const validNumbers = numbers.filter(n => n && n >= 1 && n <= 45);
            if (validNumbers.length === 6) {
                gamesToSave.push({
                    round: round,
                    set: set,
                    game: i,
                    numbers: validNumbers.sort((a, b) => a - b)
                });
            } else {
                alert(`${i}게임의 번호가 완성되지 않았습니다. (현재: ${validNumbers.length}개)`);
                return;
            }
        }
    }
    
    if (gamesToSave.length === 0) {
        alert('저장할 게임이 없습니다. 체크박스를 선택하고 번호를 완성해주세요.');
        return;
    }
    
    try {
        // Lotto023 XLSX 파일 로드
        const response = await fetch(XLSX_PATHS.LOTTO023);
        let existingData = [];
        
        if (response.ok) {
            const ab = await response.arrayBuffer();
            existingData = parseXLSX(ab);
        }
        
        // 기존 데이터에서 같은 회차, 세트 데이터 제거 (업데이트)
        existingData = existingData.filter(row => {
            const rowRound = parseInt(row['회차']) || 0;
            const rowSet = parseInt(row['세트']) || 0;
            return !(rowRound === round && rowSet === set);
        });
        
        // 현재 전역 필터 값 읽기
        const oddEvenFilter = document.getElementById('oddEvenFilter')?.value || 'none';
        const sequenceFilter = document.getElementById('sequenceFilter')?.value || 'none';
        const hotColdFilter = document.getElementById('hotColdFilter')?.value || 'none';
        
        // 필터 값 매핑 함수
        const mapOddEvenToNumber = (value) => {
            if (value === 'none') return 0;
            if (value === '1-5') return 1;
            if (value === '2-4') return 2;
            if (value === '3-3') return 3;
            if (value === '4-2') return 4;
            if (value === '5-1') return 5;
            return 0;
        };
        
        const mapSequenceToNumber = (value) => {
            if (value === 'none') return 0;
            return parseInt(value) || 0;
        };
        
        const mapHotColdToNumber = (value) => {
            if (value === 'none') return 0;
            if (value === '1-5') return 1;
            if (value === '2-4') return 2;
            if (value === '3-3') return 3;
            if (value === '4-2') return 4;
            if (value === '5-1') return 5;
            return 0;
        };
        
        const oddEvenValue = mapOddEvenToNumber(oddEvenFilter);
        const sequenceValue = mapSequenceToNumber(sequenceFilter);
        const hotColdValue = mapHotColdToNumber(hotColdFilter);
        
        // 새 데이터 추가
        gamesToSave.forEach(game => {
            // 각 게임의 모드 값 읽기
            const modeBtn = document.getElementById(`modeBtn${game.game}`);
            let gameMode = '자동';
            if (modeBtn) {
                if (modeBtn.dataset.mode === 'auto') {
                    gameMode = '자동';
                } else if (modeBtn.dataset.mode === 'semi-auto') {
                    gameMode = '반자동';
                } else if (modeBtn.dataset.mode === 'manual') {
                    gameMode = '수동';
                }
            }
            
            const row = {
                '회차': game.round.toString(),
                '세트': game.set.toString(),
                '게임': game.game.toString(),
                '홀짝': oddEvenValue.toString(),
                '연속': sequenceValue.toString(),
                '핫콜': hotColdValue.toString(),
                '게임선택': gameMode,
                '선택1': game.numbers[0].toString(),
                '선택2': game.numbers[1].toString(),
                '선택3': game.numbers[2].toString(),
                '선택4': game.numbers[3].toString(),
                '선택5': game.numbers[4].toString(),
                '선택6': game.numbers[5].toString()
            };
            existingData.push(row);
        });
        
        // XLSX로 다운로드
        const headers = ['회차', '세트', '게임', '홀짝', '연속', '핫콜', '게임선택', '선택1', '선택2', '선택3', '선택4', '선택5', '선택6'];
        const rows = existingData.map(row => headers.map(h => (row[h] != null ? String(row[h]) : '')));
        const data = [headers, ...rows];
        const ws = XLSX.utils.aoa_to_sheet(data);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Lotto023');
        XLSX.writeFile(wb, 'Lotto023.xlsx');
        
        // 결과박스 업데이트
        await loadAndDisplayResults();
        
        alert('저장 완료!');
    } catch (error) {
        alert('저장 중 오류가 발생했습니다: ' + error.message);
    }
}

/**
 * 저장된 결과 로드 및 표시
 */
async function loadAndDisplayResults() {
    const resultContainer = document.getElementById('resultContainer');
    if (!resultContainer) return;
    
    try {
        const lotto023Data = await loadLotto023Data();
        
        if (!lotto023Data || lotto023Data.length === 0) {
            resultContainer.innerHTML = '<p style="text-align: center; color: #666; font-size: 0.9rem;">저장된 결과가 없습니다.</p>';
            return;
        }
        
        // 회차, 세트별로 그룹화
        const grouped = {};
        lotto023Data.forEach(item => {
            const key = `${item.round}-${item.set}`;
            if (!grouped[key]) {
                grouped[key] = [];
            }
            grouped[key].push(item);
        });
        
        // 최신 순으로 정렬 (회차 내림차순, 세트 내림차순)
        const sortedGroups = Object.entries(grouped).sort((a, b) => {
            const [roundA, setA] = a[0].split('-').map(Number);
            const [roundB, setB] = b[0].split('-').map(Number);
            if (roundB !== roundA) return roundB - roundA;
            return setB - setA;
        });
        
        resultContainer.innerHTML = '';
        
        // 각 그룹별로 결과 표시
        sortedGroups.forEach(([key, games]) => {
            const [round, set] = key.split('-').map(Number);
            
            // 해당 회차의 당첨번호 찾기 (회차가 추첨되지 않은 경우 당첨번호 없음)
            const winRound = AppState.allLotto645Data.find(r => r.round === round);
            const winningNumbers = winRound && winRound.numbers ? new Set(winRound.numbers) : null;
            
            games.sort((a, b) => a.game - b.game);
            
            games.forEach(game => {
                const resultLine = document.createElement('div');
                resultLine.style.display = 'flex';
                resultLine.style.alignItems = 'center';
                resultLine.style.gap = '8px';
                resultLine.style.padding = '0 6px';
                resultLine.style.height = '24px';
                resultLine.style.minHeight = '24px';
                resultLine.style.boxSizing = 'border-box';
                resultLine.style.borderBottom = '1px solid #e0e0e0';
                resultLine.style.justifyContent = 'space-between';
                
                // 좌측 정보 컨테이너 (회차, 필터 정보, 세트/게임)
                const leftInfoContainer = document.createElement('div');
                leftInfoContainer.style.display = 'flex';
                leftInfoContainer.style.alignItems = 'center';
                leftInfoContainer.style.gap = '4px';
                leftInfoContainer.style.flex = '0 0 auto';
                
                // 회차
                const roundSpan = document.createElement('span');
                roundSpan.textContent = `${game.round}회`;
                roundSpan.style.fontSize = '0.85rem';
                roundSpan.style.minWidth = '40px';
                roundSpan.style.color = '#000000';
                
                // 세트와 게임과 옵션 (회차에서 4만큼 띄우고, 폰트 크기 1 더 크게)
                const setGameFilterContainer = document.createElement('div');
                setGameFilterContainer.style.display = 'flex';
                setGameFilterContainer.style.alignItems = 'center';
                setGameFilterContainer.style.gap = '2px';
                setGameFilterContainer.style.marginLeft = '4px';
                
                const setSpan = document.createElement('span');
                setSpan.textContent = `${game.set}`;
                setSpan.style.fontSize = '0.75rem'; // 0.65rem + 0.1rem
                setSpan.style.color = '#666666';
                setSpan.style.whiteSpace = 'nowrap';
                
                const separator1 = document.createElement('span');
                separator1.textContent = ' - ';
                separator1.style.fontSize = '0.75rem';
                separator1.style.color = '#666666';
                
                const gameSpan = document.createElement('span');
                gameSpan.textContent = `${game.game}`;
                gameSpan.style.fontSize = '0.75rem';
                gameSpan.style.color = '#666666';
                gameSpan.style.whiteSpace = 'nowrap';
                
                const separator2 = document.createElement('span');
                separator2.textContent = ' - ';
                separator2.style.fontSize = '0.75rem';
                separator2.style.color = '#666666';
                
                // 필터 정보 (홀짝/연속/핫콜/게임선택)
                const filterInfo = document.createElement('span');
                const oddEven = game.oddEven !== undefined ? game.oddEven : 0;
                const sequence = game.sequence !== undefined ? game.sequence : 0;
                const hotCold = game.hotCold !== undefined ? game.hotCold : 0;
                const gameMode = game.gameMode || '';
                filterInfo.textContent = `(${oddEven}/${sequence}/${hotCold}/${gameMode})`;
                filterInfo.style.fontSize = '0.8rem'; // 0.7rem + 0.1rem
                filterInfo.style.color = '#666666';
                filterInfo.style.whiteSpace = 'nowrap';
                
                setGameFilterContainer.appendChild(setSpan);
                setGameFilterContainer.appendChild(separator1);
                setGameFilterContainer.appendChild(gameSpan);
                setGameFilterContainer.appendChild(separator2);
                setGameFilterContainer.appendChild(filterInfo);
                
                leftInfoContainer.appendChild(roundSpan);
                leftInfoContainer.appendChild(setGameFilterContainer);
                
                // 우측 결과공 컨테이너
                const resultBallsContainer = document.createElement('div');
                resultBallsContainer.style.display = 'flex';
                resultBallsContainer.style.gap = '16px';
                resultBallsContainer.style.flexWrap = 'nowrap';
                resultBallsContainer.style.flex = '0 0 auto';
                resultBallsContainer.style.alignItems = 'center';
                resultBallsContainer.style.marginLeft = 'auto';
                resultBallsContainer.style.flexShrink = '0';
                
                // 결과공 생성
                game.numbers.forEach(num => {
                    const ball = createStatBall(num, 24, '0.9rem');
                    // 당첨번호와 비교 (당첨번호가 있는 경우에만)
                    if (winningNumbers && !winningNumbers.has(num)) {
                        // 당첨번호에 없으면 흰색바탕, 검정 폰트, 검정 테두리
                        ball.style.backgroundColor = '#ffffff';
                        ball.style.color = '#000000';
                        ball.style.border = '2px solid #000000';
                        // 클래스 제거하여 기본 색상 제거
                        ball.className = 'stat-ball';
                    } else if (!winningNumbers) {
                        // 당첨번호가 없는 경우 (회차 미추첨) - 흰색바탕, 검정 폰트, 검정 테두리
                        ball.style.backgroundColor = '#ffffff';
                        ball.style.color = '#000000';
                        ball.style.border = '2px solid #000000';
                        ball.className = 'stat-ball';
                    }
                    resultBallsContainer.appendChild(ball);
                });
                
                // " + " 구분자 및 보너스공 추가
                if (winRound && winRound.bonus) {
                    const separator = document.createElement('span');
                    separator.textContent = ' + ';
                    separator.style.fontSize = '0.85rem';
                    separator.style.color = '#000000';
                    separator.style.marginLeft = '4px';
                    separator.style.marginRight = '4px';
                    resultBallsContainer.appendChild(separator);
                    
                    const bonusBall = createStatBall(winRound.bonus, 24, '0.9rem');
                    resultBallsContainer.appendChild(bonusBall);
                }
                
                resultLine.appendChild(leftInfoContainer);
                resultLine.appendChild(resultBallsContainer);
                resultContainer.appendChild(resultLine);
            });
        });
    } catch (error) {
        resultContainer.innerHTML = '<p style="text-align: center; color: #f00; font-size: 0.9rem;">결과를 로드할 수 없습니다.</p>';
    }
}

/**
 * 날짜 문자열을 Date 객체로 변환 (YYYY-MM-DD, yy/mm/dd, 또는 000000 형식 지원)
 */
/**
 * 입력값을 회차 번호로 변환하는지 확인 (4자리 이내 숫자, 0000 이상)
 */
function isRoundInput(value) {
    const trimmed = value.trim();
    // 1~4자리 숫자만 (0000 이상)
    if (!/^\d{1,4}$/.test(trimmed)) {
        return false;
    }
    const round = parseInt(trimmed);
    // 0000 이상이어야 함 (0은 허용하지 않음, 0001 이상)
    return round >= 1;
}

/**
 * 회차 번호를 해당 회차의 날짜(yy/mm/dd)로 변환 (Lotto645.csv 데이터 기준)
 */
function convertRoundToDate(roundNumber) {
    // Lotto645.csv 데이터가 없으면 null 반환
    if (!AppState || !AppState.allLotto645Data || AppState.allLotto645Data.length === 0) {
        return null;
    }
    
    const round = parseInt(roundNumber);
    // 0001 이상이어야 함 (1회차 이상)
    if (isNaN(round) || round < 1) {
        return null;
    }
    
    // Lotto645.csv 데이터에서 회차 찾기 (타입 안전 비교)
    const lotto645Data = AppState.allLotto645Data;
    
    // 회차 검색 (더 안전한 비교)
    const roundData = lotto645Data.find(r => {
        // 다양한 타입과 형식 처리
        let rRound;
        if (typeof r.round === 'string') {
            rRound = parseInt(r.round.trim());
        } else if (typeof r.round === 'number') {
            rRound = Math.floor(r.round);
        } else {
            rRound = parseInt(String(r.round));
        }
        
        // NaN 체크
        if (isNaN(rRound)) {
            return false;
        }
        
        return rRound === round;
    });
    
    if (!roundData) {
        return null;
    }
    
    if (!roundData.date) {
        return null;
    }
    
    // 날짜를 yy/mm/dd 형식으로 변환
    const date = parseDate(roundData.date);
    if (!date || date === '000000' || date === '999999' || !(date instanceof Date)) {
        return null;
    }
    
    return formatDateYYMMDD(date);
}

/**
 * 6자리 날짜 입력 시 해당 날짜를 포함하는 회차 찾기
 * @param {string} dateInput - 6자리 날짜 (yyyymmdd 또는 yymmdd)
 * @param {boolean} isStartDate - 시작일인지 여부 (true: 이후 첫 회차, false: 이전 마지막 회차)
 * @returns {string} 해당 회차의 날짜 (yy/mm/dd) 또는 null
 */
function convertDateToRoundDate(dateInput, isStartDate) {
    if (!AppState || !AppState.allLotto645Data) return null;
    
    // 6자리 날짜 파싱
    const date = parseDate(dateInput);
    if (!date || date === '000000' || date === '999999') return null;
    
    if (isStartDate) {
        // 시작일: 시작일 포함 이후 첫 회차 찾기
        for (let i = AppState.allLotto645Data.length - 1; i >= 0; i--) {
            const roundDate = parseDate(AppState.allLotto645Data[i].date);
            if (roundDate && roundDate >= date) {
                return formatDateYYMMDD(roundDate);
            }
        }
    } else {
        // 종료일: 종료일 포함 이전 마지막 회차 찾기
        for (let i = 0; i < AppState.allLotto645Data.length; i++) {
            const roundDate = parseDate(AppState.allLotto645Data[i].date);
            if (roundDate && roundDate <= date) {
                return formatDateYYMMDD(roundDate);
            }
        }
    }
    
    return null;
}

function parseDate(dateString) {
    if (!dateString) return null;
    
    // 공백 제거
    dateString = dateString.trim();
    
    // 4자리 이내 숫자는 회차로 처리하지 않음 (parseDate는 날짜만 파싱)
    // 회차 처리는 별도 함수에서 처리
    
    // 000000 형식 처리 (예: 240101 -> 24/01/01, 000000은 첫회, 999999는 최종회)
    if (/^\d{6}$/.test(dateString)) {
        // 000000 또는 999999는 특별 처리
        if (dateString === '000000' || dateString === '999999') {
            return dateString; // 특별값으로 반환
        }
        
        const year = parseInt(dateString.substring(0, 2));
        const month = parseInt(dateString.substring(2, 4));
        const day = parseInt(dateString.substring(4, 6));
        
        if (month < 1 || month > 12 || day < 1 || day > 31) {
            return null;
        }
        
        const fullYear = year >= 50 ? 1900 + year : 2000 + year;
        return new Date(fullYear, month - 1, day);
    }
    
    // yy/mm/dd 형식 처리
    if (dateString.includes('/')) {
        const parts = dateString.split('/');
        if (parts.length !== 3) return null;
        let year = parseInt(parts[0]);
        const month = parseInt(parts[1]);
        const day = parseInt(parts[2]);
        
        // yy 형식이면 2000년대 또는 1900년대로 해석
        if (year < 100) {
            year = year >= 50 ? 1900 + year : 2000 + year;
        }
        
        return new Date(year, month - 1, day);
    }
    
    // YYYY-MM-DD 형식 처리
    const parts = dateString.split('-');
    if (parts.length !== 3) return null;
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
}

/**
 * 날짜를 YYYY-MM-DD 형식 문자열로 변환
 */
function formatDate(date) {
    if (!date) return '';
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * 날짜를 yy/mm/dd 형식 문자열로 변환
 */
function formatDateYYMMDD(date) {
    if (!date) return '';
    const year = String(date.getFullYear()).substring(2);
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}/${month}/${day}`;
}

/**
 * YYYY-MM-DD 형식을 yy/mm/dd 형식으로 변환
 */
function convertToYYMMDD(dateString) {
    if (!dateString) return '';
    const date = parseDate(dateString);
    if (!date) return dateString;
    return formatDateYYMMDD(date);
}

/**
 * yy/mm/dd 형식을 YYYY-MM-DD 형식으로 변환 (000000/999999 특수 처리)
 */
function convertFromYYMMDD(dateString) {
    if (!dateString) return '';
    // 000000 또는 999999는 그대로 반환
    if (dateString.trim() === '000000' || dateString.trim() === '999999') {
        return dateString.trim();
    }
    const date = parseDate(dateString);
    if (!date) return dateString;
    return formatDate(date);
}

/**
 * 시작일과 종료일 사이의 회차 범위 계산
 * 시작일을 포함한 이후 첫 회차 ~ 종료일을 포함한 이전 회차
 */
function calculateRoundRange(lotto645Data, startDateStr, endDateStr) {
    if (!startDateStr || !endDateStr || !lotto645Data || lotto645Data.length === 0) {
        return null;
    }
    
    const startDate = parseDate(startDateStr);
    const endDate = parseDate(endDateStr);
    
    if (!startDate || !endDate) {
        return null;
    }
    
    // 필터링된 데이터를 가져옴
    const filteredData = filterDataByDateRange(
        lotto645Data,
        convertFromYYMMDD(startDateStr),
        convertFromYYMMDD(endDateStr)
    );
    
    if (filteredData.length === 0) {
        return null;
    }
    
    // 필터링된 데이터에서 최소/최대 회차 찾기
    let minRound = filteredData[0].round;
    let maxRound = filteredData[0].round;
    
    filteredData.forEach(round => {
        if (round.round < minRound) {
            minRound = round.round;
        }
        if (round.round > maxRound) {
            maxRound = round.round;
        }
    });
    
    return { min: minRound, max: maxRound };
}

/**
 * 날짜 입력에서 해당 회차 번호 찾기 (Lotto645.csv 데이터 기준)
 * @param {string} dateInput - 날짜 입력 (회차 또는 날짜)
 * @param {boolean} isStartDate - 시작일인지 여부
 * @returns {number|null} 회차 번호 또는 null
 */
function findRoundFromDateInput(dateInput, isStartDate) {
    // Lotto645.csv 데이터가 없으면 null 반환
    if (!AppState || !AppState.allLotto645Data || AppState.allLotto645Data.length === 0) {
        return null;
    }
    
    if (!dateInput) return null;
    
    const value = dateInput.trim();
    if (!value) return null;
    
    // Lotto645.csv 데이터 사용 (필터링되지 않은 원본 데이터)
    const lotto645Data = AppState.allLotto645Data;
    
    // 4자리 이내 숫자는 회차로 처리
    if (isRoundInput(value)) {
        const round = parseInt(value);
        // Lotto645.csv에서 해당 회차가 존재하는지 확인 (타입 안전 비교)
        const roundData = lotto645Data.find(r => {
            // 다양한 타입과 형식 처리
            let rRound;
            if (typeof r.round === 'string') {
                rRound = parseInt(r.round.trim());
            } else if (typeof r.round === 'number') {
                rRound = Math.floor(r.round);
            } else {
                rRound = parseInt(String(r.round));
            }
            
            // NaN 체크
            if (isNaN(rRound)) {
                return false;
            }
            
            return rRound === round;
        });
        return roundData ? round : null;
    }
    
    // 날짜 형식 처리 (6자리 숫자 또는 yy/mm/dd 형식)
    if (/^\d{6}$/.test(value) || value.includes('/') || value.includes('-')) {
        // 특수값 000000 또는 999999 처리
        if (value === '000000') {
            // 첫회차 (Lotto645.csv에서 가장 오래된 회차)
            if (lotto645Data.length > 0) {
                const firstRound = lotto645Data[lotto645Data.length - 1];
                return typeof firstRound.round === 'string' ? parseInt(firstRound.round) : firstRound.round;
            }
            return null;
        } else if (value === '999999') {
            // 최종회차 (Lotto645.csv에서 가장 최신 회차)
            if (lotto645Data.length > 0) {
                const lastRound = lotto645Data[0];
                return typeof lastRound.round === 'string' ? parseInt(lastRound.round) : lastRound.round;
            }
            return null;
        }
        
        const date = parseDate(value);
        if (!date || date === '000000' || date === '999999' || !(date instanceof Date)) {
            return null;
        }
        
        // 날짜로부터 회차 찾기 (Lotto645.csv 데이터 기준)
        if (isStartDate) {
            // 시작일: 시작일 포함 이후 첫 회차 찾기 (오래된 것부터 검색)
            for (let i = lotto645Data.length - 1; i >= 0; i--) {
                const roundItem = lotto645Data[i];
                const roundDate = parseDate(roundItem.date);
                if (roundDate && roundDate instanceof Date && roundDate >= date) {
                    return typeof roundItem.round === 'string' ? parseInt(roundItem.round) : roundItem.round;
                }
            }
        } else {
            // 종료일: 종료일 포함 이전 마지막 회차 찾기 (최신 것부터 검색)
            for (let i = 0; i < lotto645Data.length; i++) {
                const roundItem = lotto645Data[i];
                const roundDate = parseDate(roundItem.date);
                if (roundDate && roundDate instanceof Date && roundDate <= date) {
                    return typeof roundItem.round === 'string' ? parseInt(roundItem.round) : roundItem.round;
                }
            }
        }
    }
    
    return null;
}

/**
 * 시작일/종료일 회차 표시 업데이트 (Lotto645.csv 데이터 기준)
 * 시작일/종료일 입력값을 바탕으로 Lotto645.csv에서 해당 회차를 찾아 표시
 */
function updateRoundDisplay() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    const startRoundDisplay = document.getElementById('startRoundDisplay');
    const endRoundDisplay = document.getElementById('endRoundDisplay');
    
    if (!startDateInput || !endDateInput || !startRoundDisplay || !endRoundDisplay) {
        return;
    }
    
    // Lotto645.csv 데이터를 기준으로 시작일 회차 찾기
    const startRound = findRoundFromDateInput(startDateInput.value, true);
    if (startRound) {
        startRoundDisplay.textContent = `(${startRound.toString().padStart(4, '0')}회)`;
    } else {
        startRoundDisplay.textContent = '(0000회)';
    }
    
    // Lotto645.csv 데이터를 기준으로 종료일 회차 찾기
    const endRound = findRoundFromDateInput(endDateInput.value, false);
    if (endRound) {
        endRoundDisplay.textContent = `(${endRound.toString().padStart(4, '0')}회)`;
    } else {
        endRoundDisplay.textContent = '(0000회)';
    }
}

/**
 * 회차 범위 표시 업데이트
 * (roundRange 요소가 제거되어 이 함수는 더 이상 사용되지 않음)
 */
function updateRoundRangeDisplay() {
    // 회차 표시 업데이트로 대체
    updateRoundDisplay();
}

/**
 * 시작일과 종료일 비교 검증 (종료일이 시작일보다 커야 함)
 * @returns {boolean} 검증 통과 여부
 */
function validateDateRange() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (!startDateInput || !endDateInput) {
        return true; // 입력 필드가 없으면 검증 건너뛰기
    }
    
    const startValue = startDateInput.value.trim();
    const endValue = endDateInput.value.trim();
    
    if (!startValue || !endValue) {
        return true; // 값이 없으면 검증 건너뛰기
    }
    
    // 시작일 회차/날짜 찾기
    let startRound = null;
    let startDate = null;
    
    if (isRoundInput(startValue)) {
        // 회차로 입력한 경우, 날짜로 변환해서 비교
        const dateStr = convertRoundToDate(startValue);
        if (dateStr) {
            const parsedDate = parseDate(dateStr);
            if (parsedDate && parsedDate instanceof Date) {
                startDate = parsedDate;
                startRound = parseInt(startValue);
            }
        }
    } else {
        // 날짜로 입력한 경우
        const parsedDate = parseDate(startValue);
        if (parsedDate && parsedDate instanceof Date) {
            startDate = parsedDate;
            startRound = findRoundFromDateInput(startValue, true);
        }
    }
    
    // 종료일 회차/날짜 찾기
    let endRound = null;
    let endDate = null;
    
    if (isRoundInput(endValue)) {
        // 회차로 입력한 경우, 날짜로 변환해서 비교
        const dateStr = convertRoundToDate(endValue);
        if (dateStr) {
            const parsedDate = parseDate(dateStr);
            if (parsedDate && parsedDate instanceof Date) {
                endDate = parsedDate;
                endRound = parseInt(endValue);
            }
        }
    } else {
        // 날짜로 입력한 경우
        const parsedDate = parseDate(endValue);
        if (parsedDate && parsedDate instanceof Date) {
            endDate = parsedDate;
            endRound = findRoundFromDateInput(endValue, false);
        }
    }
    
    // 회차로 비교 가능한 경우
    if (startRound !== null && endRound !== null) {
        if (endRound <= startRound) {
            alert(`종료일(회차 ${endRound})은 시작일(회차 ${startRound})보다 커야 합니다.`);
            return false;
        }
        return true;
    }
    
    // 날짜로 비교 가능한 경우
    if (startDate && endDate && startDate instanceof Date && endDate instanceof Date) {
        if (endDate <= startDate) {
            const startDateStr = formatDateYYMMDD(startDate);
            const endDateStr = formatDateYYMMDD(endDate);
            alert(`종료일(${endDateStr})은 시작일(${startDateStr})보다 커야 합니다.`);
            return false;
        }
        return true;
    }
    
    return true; // 비교 불가능한 경우는 통과
}

/**
 * 선택된 기간에 해당하는 데이터 필터링
 * 시작일을 포함한 이후 첫 회차 ~ 종료일을 포함한 이전 회차
 */
function filterDataByDateRange(lotto645Data, startDate, endDate) {
    if (!startDate || !endDate || !lotto645Data || lotto645Data.length === 0) {
        return [];
    }
    
    // 000000/999999 특수 처리
    let start, end;
    if (startDate === '000000') {
        // 첫회차부터
        start = null; // 첫회차를 의미
    } else {
        start = parseDate(startDate);
        if (!start) return [];
        start.setHours(0, 0, 0, 0);
    }
    
    if (endDate === '999999') {
        // 최종회차까지
        end = null; // 최종회차를 의미
    } else {
        end = parseDate(endDate);
        if (!end) return [];
        end.setHours(23, 59, 59, 999);
    }
    
    // 데이터의 첫 번째 날짜(가장 오래된)와 마지막 날짜(가장 최신) 확인
    const oldestRoundDate = parseDate(lotto645Data[lotto645Data.length - 1].date);
    const newestRoundDate = parseDate(lotto645Data[0].date);
    
    if (!oldestRoundDate || !newestRoundDate) {
        return [];
    }
    
    // 000000이면 첫회차부터, 999999이면 최종회차까지
    if (start === null) {
        start = oldestRoundDate;
        start.setHours(0, 0, 0, 0);
    }
    if (end === null) {
        end = newestRoundDate;
        end.setHours(23, 59, 59, 999);
    }
    
    // 시작일이 데이터의 가장 최신 날짜보다 크거나, 종료일이 데이터의 가장 오래된 날짜보다 작으면 데이터 없음
    if (start > newestRoundDate || end < oldestRoundDate) {
        return [];
    }
    
    // 시작일을 포함한 이후 첫 회차 찾기 (오래된 것부터 순회: length-1부터 0까지)
    let startIndex = -1;
    for (let i = lotto645Data.length - 1; i >= 0; i--) {
        const roundDate = parseDate(lotto645Data[i].date);
        if (roundDate && roundDate >= start) {
            startIndex = i;
            break;
        }
    }
    
    // 종료일을 포함한 이전 마지막 회차 찾기 (최신 것부터 순회: 0부터 length-1까지)
    let endIndex = -1;
    for (let i = 0; i < lotto645Data.length; i++) {
        const roundDate = parseDate(lotto645Data[i].date);
        if (roundDate && roundDate <= end) {
            endIndex = i;
            break;
        }
    }
    
    if (startIndex === -1 || endIndex === -1) {
        return [];
    }
    
    if (startIndex < endIndex) {
        return [];
    }
    
    return lotto645Data.slice(endIndex, startIndex + 1);
}

/**
 * 날짜 범위 변경 시 통계 및 회차별 당첨번호 업데이트 (선택 버튼 클릭 시 호출)
 */
function updateStatsByDateRange() {
    const startDateInput = document.getElementById('startDate');
    const endDateInput = document.getElementById('endDate');
    
    if (!startDateInput || !endDateInput || !AppState || !AppState.allLotto645Data) {
        return;
    }
    
    const startDateStr = startDateInput.value.trim();
    const endDateStr = endDateInput.value.trim();
    
    if (!startDateStr || !endDateStr) {
        alert('시작일과 종료일을 입력해주세요.');
        return;
    }
    
    // yy/mm/dd 형식을 YYYY-MM-DD 형식으로 변환 (000000/999999는 그대로 전달)
    const startDate = convertFromYYMMDD(startDateStr);
    const endDate = convertFromYYMMDD(endDateStr);
    
    // 000000/999999가 아닌 경우에만 유효성 검사
    if (startDateStr !== '000000' && !startDate) {
        alert('시작일 형식이 올바르지 않습니다. yy/mm/dd 형식 또는 000000으로 입력해주세요.');
        return;
    }
    if (endDateStr !== '999999' && !endDate) {
        alert('종료일 형식이 올바르지 않습니다. yy/mm/dd 형식 또는 999999로 입력해주세요.');
        return;
    }
    
    // 날짜 범위로 데이터 필터링 (원본 데이터는 유지)
    // 중요: AppState.allLotto645Data는 항상 원본 Lotto645.csv 데이터를 유지해야 함
    const filteredData = filterDataByDateRange(AppState.allLotto645Data, startDate, endDate);
    
    // 필터링된 데이터로 통계만 재계산 (원본 데이터는 절대 변경하지 않음)
    if (filteredData.length > 0) {
        // 원본 데이터를 유지하면서 필터링된 데이터로 통계만 재계산
        // AppState.allLotto645Data는 절대 변경하지 않음
        AppState.winStatsMap = calculateWinStats(filteredData);
        AppState.winStats = Array.from(AppState.winStatsMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => a.number - b.number);
        
        AppState.appearanceStatsMap = calculateAppearanceStats(filteredData);
        
        const winPercentageMap = calculatePercentageStats(AppState.winStatsMap, filteredData.length);
        AppState.winPercentageCache = winPercentageMap;
        
        const appearancePercentageMap = calculatePercentageStats(AppState.appearanceStatsMap, filteredData.length);
        AppState.appearancePercentageCache = appearancePercentageMap;
        
        AppState.avgPercentageCache = winPercentageMap;
        
        const avgCount = filteredData.length > 0 
            ? filteredData.reduce((sum, round) => sum + round.numbers.length, 0) / (filteredData.length * 6)
            : 0;
        AppState.avgCountCache = avgCount;
        
        updateCurrentStats();
    } else {
        // 데이터가 없으면 빈 통계로 초기화
        AppState.winStats = [];
        AppState.winStatsMap = new Map();
        AppState.appearanceStatsMap = new Map();
        AppState.winPercentageCache = new Map();
        AppState.appearancePercentageCache = new Map();
        AppState.avgPercentageCache = new Map();
        
        // 1부터 45까지 초기화
        for (let i = 1; i <= 45; i++) {
            AppState.winStatsMap.set(i, 0);
            AppState.appearanceStatsMap.set(i, 0);
            AppState.winPercentageCache.set(i, 0);
            AppState.appearancePercentageCache.set(i, 0);
        }
        AppState.winStats = Array.from(AppState.winStatsMap.entries())
            .map(([number, count]) => ({ number, count }))
            .sort((a, b) => a.number - b.number);
    }
    
    // 통계 리스트 및 선택공 그리드 업데이트
    renderStatsList();
    renderNumberGrid();
    
    // 회차별 당첨번호 업데이트
    const viewNumbersList = document.getElementById('viewNumbersList');
    if (viewNumbersList) {
        viewNumbersList.innerHTML = '';
        
        if (filteredData.length === 0) {
            viewNumbersList.innerHTML = '<p>선택한 기간에 해당하는 데이터가 없습니다.</p>';
            return;
        }
        
        // 필터링된 데이터를 회차순으로 정렬 (최신 회차부터 내림차순)
        const sortedRounds = [...filteredData];
        
        sortedRounds.forEach(round => {
            // 한 라인으로 출력: 회차(날짜) + 번호들(우측 정렬) + 보너스
            const roundLine = document.createElement('div');
            roundLine.className = 'round-number-line';
            roundLine.style.display = 'flex';
            roundLine.style.alignItems = 'center';
            roundLine.style.justifyContent = 'space-between';
            roundLine.style.gap = '8px';
            roundLine.style.marginBottom = '4px';
            roundLine.style.padding = '0 8px';
            roundLine.style.height = '30px';
            roundLine.style.minHeight = '30px';
            roundLine.style.boxSizing = 'border-box';
            
            // 회차 정보 (좌측)
            const roundInfo = document.createElement('span');
            roundInfo.style.fontWeight = '400';
            roundInfo.style.fontSize = '0.85rem';
            roundInfo.style.minWidth = '100px';
            roundInfo.style.color = '#000000';
            roundInfo.style.opacity = '1';
            roundInfo.style.display = 'flex';
            roundInfo.style.alignItems = 'center';
            roundInfo.style.gap = '4px';
            
            const roundNumber = document.createElement('span');
            roundNumber.textContent = `${round.round}`;
            
            const roundUnit = document.createElement('span');
            roundUnit.style.fontWeight = '700';
            roundUnit.textContent = '회';
            
            // 추첨일: yy/mm/dd 형식으로 표시 (Excel serial 46046 등 → yy/mm/dd)
            let formattedDate = '';
            if (round.date != null && round.date !== '') {
                let dateObj = null;
                const strVal = String(round.date).trim();
                if (typeof round.date === 'number' || /^\d{5,}$/.test(strVal)) {
                    const serial = typeof round.date === 'number' ? round.date : parseInt(strVal, 10);
                    if (!isNaN(serial) && serial >= 1) {
                        const utcMs = (serial - 25569) * 86400 * 1000;
                        dateObj = new Date(utcMs);
                    }
                } else {
                    dateObj = parseDate(strVal);
                }
                if (dateObj && dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                    formattedDate = formatDateYYMMDD(dateObj);
                } else {
                    const str = String(round.date);
                    const dateParts = str.split('-');
                    if (dateParts.length === 3) {
                        const y = dateParts[0].length >= 2 ? dateParts[0].slice(-2) : dateParts[0];
                        const m = dateParts[1].padStart(2, '0');
                        const d = dateParts[2].padStart(2, '0');
                        formattedDate = `${y}/${m}/${d}`;
                    } else {
                        formattedDate = str;
                    }
                }
            }
            // 합계 계산 (당첨공 6개 합계, 보너스 제외)
            const sum = round.numbers.reduce((acc, num) => acc + (num || 0), 0);
            const sumDisplay = document.createElement('span');
            sumDisplay.className = 'round-sum-display';
            sumDisplay.textContent = `[ ${sum.toString().padStart(3, '0')} ] `;
            sumDisplay.style.fontSize = '0.85rem';
            sumDisplay.style.color = '#ff0000';
            sumDisplay.style.fontWeight = 'bold';
            
            const dateSpan = document.createElement('span');
            dateSpan.className = 'round-date-display';
            dateSpan.textContent = formattedDate;
            
            roundInfo.appendChild(roundNumber);
            roundInfo.appendChild(roundUnit);
            roundInfo.appendChild(sumDisplay);
            roundInfo.appendChild(dateSpan);
            
            // 번호들 + 보너스 (우측 정렬)
            const numbersContainer = document.createElement('div');
            numbersContainer.style.display = 'flex';
            numbersContainer.style.alignItems = 'center';
            numbersContainer.style.gap = '16px';
            numbersContainer.style.justifyContent = 'flex-end';
            numbersContainer.style.flexWrap = 'wrap';
            numbersContainer.style.marginLeft = 'auto';
            
            // 당첨번호들
            round.numbers.forEach(num => {
                const ball = createStatBall(num, 24, '0.9rem');
                numbersContainer.appendChild(ball);
            });
            
            // 보너스 번호가 있는 경우
            if (round.bonus && round.bonus > 0) {
                const plusSign = createPlusSign('color: #000000; font-weight: bold; margin: 0 4px; font-size: 1rem;');
                numbersContainer.appendChild(plusSign);
                
                const bonusBall = createStatBall(round.bonus, 24, '0.9rem');
                numbersContainer.appendChild(bonusBall);
            }
            
            roundLine.appendChild(roundInfo);
            roundLine.appendChild(numbersContainer);
            viewNumbersList.appendChild(roundLine);
        });
    }
    
    // 회차 범위 표시 업데이트
    updateRoundRangeDisplay();
    
    // 합계 평균 업데이트
    updateAverageSumDisplay(filteredData);
}

/**
 * 통계 렌더링 (전체 데이터 표시)
 * 중요: AppState.allLotto645Data (원본 Lotto645.csv 데이터)를 기준으로 표시
 */
function renderStats(lotto645Data) {
    const statsList = document.getElementById('statsList');
    const viewNumbersList = document.getElementById('viewNumbersList');
    
    if (!statsList || !viewNumbersList) {
        return;
    }
    
    // renderStats는 초기 렌더링용으로 전체 원본 데이터 사용
    // 날짜 필터링은 updateStatsByDateRange 함수에서만 적용
    // 중요: 원본 데이터(AppState.allLotto645Data)는 절대 변경하지 않음
    
    if (!AppState || !AppState.winStats || AppState.winStats.length === 0) {
        statsList.innerHTML = '<p>통계 데이터가 없습니다.</p>';
        return;
    }
    
    // 통계 리스트 렌더링
    renderStatsList();
    
    // 선택공 그리드 렌더링
    renderNumberGrid();
    
    // 회차 정보 표시 (원본 데이터 기준)
    const roundStatsList = document.getElementById('roundStatsList');
    if (roundStatsList && AppState.allLotto645Data && AppState.allLotto645Data.length > 0) {
        const originalData = AppState.allLotto645Data;
        const minRound = originalData[originalData.length - 1].round;
        const maxRound = originalData[0].round;
        roundStatsList.innerHTML = `
            <div class="stats-box">
                <div class="stats-section">
                    <div class="stat-label">회차 범위</div>
                    <div class="stat-value">${minRound}회 ~ ${maxRound}회</div>
                </div>
                <div class="stats-section" style="margin-top: 8px;">
                    <div class="stat-label">총 회차</div>
                    <div class="stat-value">${originalData.length}회</div>
                </div>
            </div>
        `;
    }
    
    // 전체 회차 번호 표시 (원본 Lotto645.csv 데이터 기준)
    viewNumbersList.innerHTML = '';
    
    // 원본 데이터 사용 (필터링되지 않은 전체 데이터)
    const displayData = AppState.allLotto645Data || lotto645Data;
    
    if (!displayData || displayData.length === 0) {
        viewNumbersList.innerHTML = '<p>데이터가 없습니다.</p>';
        return;
    }
    
    // 회차순으로 정렬 (최신 회차부터 내림차순)
    // 원본 Lotto645.csv 데이터를 기준으로 표시
    const sortedRounds = [...displayData]; // 최신 회차부터 내림차순
    
    sortedRounds.forEach(round => {
        // 한 라인으로 출력: 회차(날짜) + 번호들(우측 정렬) + 보너스
        const roundLine = document.createElement('div');
        roundLine.className = 'round-number-line';
        roundLine.style.display = 'flex';
        roundLine.style.alignItems = 'center';
        roundLine.style.justifyContent = 'space-between';
        roundLine.style.gap = '8px';
        roundLine.style.marginBottom = '4px';
        roundLine.style.padding = '0 8px';
        roundLine.style.height = '25px';
        roundLine.style.minHeight = '25px';
        roundLine.style.boxSizing = 'border-box';
        
        // 회차 정보 (좌측) - 당첨통계 리스트와 동일한 스타일
        const roundInfo = document.createElement('span');
        roundInfo.style.fontWeight = '400';
        roundInfo.style.fontSize = '0.85rem';
        roundInfo.style.minWidth = '100px';
        roundInfo.style.color = '#000000';
        roundInfo.style.opacity = '1';
        roundInfo.style.display = 'flex';
        roundInfo.style.alignItems = 'center';
        roundInfo.style.gap = '4px';
        
        const roundNumber = document.createElement('span');
        roundNumber.textContent = `${round.round}`;
        
        const roundUnit = document.createElement('span');
        roundUnit.style.fontWeight = '700';
        roundUnit.textContent = '회';
        
        // 추첨일: yy/mm/dd 형식으로 표시 (Excel serial 46046 등 → yy/mm/dd)
        let formattedDate = '';
        if (round.date != null && round.date !== '') {
            let dateObj = null;
            const strVal = String(round.date).trim();
            if (typeof round.date === 'number' || /^\d{5,}$/.test(strVal)) {
                const serial = typeof round.date === 'number' ? round.date : parseInt(strVal, 10);
                if (!isNaN(serial) && serial >= 1) {
                    const utcMs = (serial - 25569) * 86400 * 1000;
                    dateObj = new Date(utcMs);
                }
            } else {
                dateObj = parseDate(strVal);
            }
            if (dateObj && dateObj instanceof Date && !isNaN(dateObj.getTime())) {
                formattedDate = formatDateYYMMDD(dateObj);
            } else {
                const str = String(round.date);
                const dateParts = str.split('-');
                if (dateParts.length === 3) {
                    const y = dateParts[0].length >= 2 ? dateParts[0].slice(-2) : dateParts[0];
                    const m = dateParts[1].padStart(2, '0');
                    const d = dateParts[2].padStart(2, '0');
                    formattedDate = `${y}/${m}/${d}`;
                } else {
                    formattedDate = str;
                }
            }
        }
        // 합계 계산 (당첨공 6개 합계, 보너스 제외)
        const sum = round.numbers.reduce((acc, num) => acc + (num || 0), 0);
        const sumDisplay = document.createElement('span');
        sumDisplay.className = 'round-sum-display';
        sumDisplay.textContent = `[ ${sum.toString().padStart(3, '0')} ] `;
        sumDisplay.style.fontSize = '0.85rem';
        sumDisplay.style.color = '#ff0000';
        sumDisplay.style.fontWeight = 'bold';
        
        const dateSpan = document.createElement('span');
        dateSpan.className = 'round-date-display';
        dateSpan.textContent = formattedDate;
        
        roundInfo.appendChild(roundNumber);
        roundInfo.appendChild(roundUnit);
        roundInfo.appendChild(sumDisplay);
        roundInfo.appendChild(dateSpan);
        
        // 번호들 + 보너스 (우측 정렬)
        const numbersContainer = document.createElement('div');
        numbersContainer.style.display = 'flex';
        numbersContainer.style.alignItems = 'center';
        numbersContainer.style.gap = '16px';
        numbersContainer.style.justifyContent = 'flex-end';
        numbersContainer.style.flexWrap = 'wrap';
        numbersContainer.style.marginLeft = 'auto';
        
        // 당첨번호들
        round.numbers.forEach(num => {
            const ball = createStatBall(num, 24, '0.9rem');
            numbersContainer.appendChild(ball);
        });
        
        // 보너스 번호가 있는 경우
        if (round.bonus && round.bonus > 0) {
            const plusSign = createPlusSign('color: #000000; font-weight: bold; margin: 0 4px; font-size: 1rem;');
            numbersContainer.appendChild(plusSign);
            
            const bonusBall = createStatBall(round.bonus, 24, '0.9rem');
            numbersContainer.appendChild(bonusBall);
        }
        
        roundLine.appendChild(roundInfo);
        roundLine.appendChild(numbersContainer);
        viewNumbersList.appendChild(roundLine);
    });
    
        // 중앙 패널 업데이트: 선택공 그리드 렌더링
        renderNumberGrid();
        
        // 합계 평균 업데이트
        updateAverageSumDisplay(lotto645Data);
}

/**
 * 합계 평균 표시 업데이트 (헤더에 표시)
 */
function updateAverageSumDisplay(data) {
    const statsHeaderDisplay = document.getElementById('statsHeaderDisplay');
    if (!statsHeaderDisplay || !data || data.length === 0) {
        if (statsHeaderDisplay) {
            statsHeaderDisplay.textContent = '[ 0000회, 평균: 000 ]';
        }
        return;
    }
    
    // 각 회차별 당첨공 6개 합계 계산 (보너스 제외)
    const sums = data.map(round => {
        if (!round.numbers || round.numbers.length === 0) return 0;
        return round.numbers.reduce((acc, num) => acc + (num || 0), 0);
    });
    
    // 평균 계산
    const average = sums.length > 0 ? Math.round(sums.reduce((acc, sum) => acc + sum, 0) / sums.length) : 0;
    
    // 횟수와 평균을 포맷에 맞게 표시
    const count = data.length.toString().padStart(4, '0');
    const avgStr = average.toString().padStart(3, '0');
    statsHeaderDisplay.textContent = `[ ${count}회, 평균: ${avgStr} ]`;
}

/** 최신 추첨정보 모달 표시/숨김 (회차별 당첨번호 클릭 시) */
function showLatestLottoModal(htmlContent) {
    var modal = document.getElementById('latestLottoModal');
    var content = document.getElementById('latestLottoModalContent');
    if (modal && content) {
        content.innerHTML = htmlContent;
        modal.classList.add('is-open');
        modal.setAttribute('aria-hidden', 'false');
    }
}
function hideLatestLottoModal() {
    var modal = document.getElementById('latestLottoModal');
    if (modal) {
        modal.classList.remove('is-open');
        modal.setAttribute('aria-hidden', 'true');
    }
}

(function setupLatestLottoClick() {
    var titleEl = document.getElementById('roundNumbersTitle');
    if (!titleEl) return;
    titleEl.style.cursor = 'pointer';
    var closeBtn = document.getElementById('latestLottoModalClose');
    if (closeBtn) closeBtn.addEventListener('click', hideLatestLottoModal);
    var modal = document.getElementById('latestLottoModal');
    if (modal) modal.addEventListener('click', function(e) { if (e.target === modal) hideLatestLottoModal(); });
    titleEl.addEventListener('click', async function() {
        // Live Server(5500) 등으로 열어도 API는 Flask(8000)로 보내기 위해 백엔드 주소 고정
        var backendUrl = (typeof window !== 'undefined' && window.LOTTO_BACKEND_URL) ? window.LOTTO_BACKEND_URL : 'http://localhost:8000';
        var origin = typeof window !== 'undefined' && window.location && window.location.origin;
        var targetUrl = backendUrl + '/api/lotto-latest';
        console.log('[로또] API 요청 주소:', targetUrl, '(현재 페이지 origin:', origin + ')');
        showLatestLottoModal('<p>동행복권 추첨결과 페이지를 불러오는 중입니다...</p>');
        try {
            var res = await fetch(targetUrl);
            var data = await res.json().catch(function() { return { returnValue: 'fail' }; });
            if (data.returnValue !== 'success' || !data.drwNo) {
                var errHtml = '<p class="error-msg">' + (data.error || '최신 추첨정보를 가져오지 못했습니다.') + '</p>';
                errHtml += '<div style="margin-top:12px;font-size:13px;text-align:left;">';
                errHtml += '<p><strong>1. 동행복권 결과 페이지:</strong> ' + (data.dhlottery_page || '-') + '</p>';
                errHtml += '<p><strong>2. DuckDuckGo 검색:</strong> ' + (data.duckduckgo || '-') + '</p>';
                errHtml += '</div>';
                showLatestLottoModal(errHtml);
                return;
            }
            var drwNo = data.drwNo;
            var dateStr = data.drwNoDate || '';
            if (data.drwNoDate && typeof parseDate === 'function' && typeof formatDateYYMMDD === 'function') {
                var dateObj = parseDate(String(data.drwNoDate).trim());
                if (dateObj instanceof Date) dateStr = formatDateYYMMDD(dateObj);
            }
            var nums = [data.drwtNo1, data.drwtNo2, data.drwtNo3, data.drwtNo4, data.drwtNo5, data.drwtNo6].filter(function(n) { return n != null; });
            var bnus = data.bnusNo;
            var getClass = typeof getBallClass === 'function' ? getBallClass : function() { return ''; };
            var row = '<div class="latest-draw-row"><span style="margin-right:8px;">' + drwNo + '회' + (dateStr ? ' (' + dateStr + ')' : '') + '</span>';
            nums.forEach(function(n) {
                row += '<span class="latest-draw-ball stat-ball ' + getClass(n) + '">' + n + '</span>';
            });
            if (bnus != null) row += '<span style="margin-left:4px;">+</span><span class="latest-draw-ball stat-ball ' + getClass(bnus) + '">' + bnus + '</span>';
            row += '</div>';
            var src = data.source || '';
            var srcLabel = (src === 'dhlottery_page') ? '동행복권 결과 페이지' : (src === 'duckduckgo') ? 'DuckDuckGo 웹 검색' : src;
            if (srcLabel) row += '<p class="latest-draw-source" style="margin-top:8px;font-size:12px;color:#666;">출처: ' + srcLabel + '</p>';
            showLatestLottoModal(row);
        } catch (e) {
            showLatestLottoModal('<p class="error-msg">요청 실패: ' + (e.message || String(e)) + '</p>');
        }
    });
})();

// 모든 리소스가 로드된 후 초기화 실행
console.log('[로또] load 리스너 등록, readyState:', document.readyState);
window.addEventListener('load', function() {
    console.log('[로또] load 이벤트 발생 → initializeApp 예약');
    setTimeout(function() {
        console.log('[로또] initializeApp 호출 직전');
        try {
            initializeApp();
        } catch (e) {
            console.error('[로또] initializeApp 예외:', e);
        }
    }, 100);
});

// 백업: 이미 로드된 경우에도 실행
if (document.readyState === 'complete') {
    console.log('[로또] readyState 이미 complete → initializeApp 예약');
    setTimeout(initializeApp, 200);
}

// B(금융거래통합정보) 링크: data-url 또는 href가 있으면 해당 URL 사용, 없으면 숨김
(function() {
    var el = document.getElementById('financial-info-link');
    if (!el) return;
    var url = (el.getAttribute('data-url') || el.getAttribute('href') || '').trim();
    if (url && url !== '#') {
        el.href = url;
    } else {
        el.parentElement.style.display = 'none';
    }
})();

