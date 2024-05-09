export const CAMELOT_NFP_MANAGER = '0x00c7f3082833e796A5b3e4Bd59f6642FF44DCD15'
export const CAMELOT_ALGEBRA_FACTORY = '0x1a3c9B1d2F0529D97f2afC5136Cc23e58f1FD35B'
export const CAMELOT_ALGEBRA_POOL = '0xaa45265a94c93802be9511e426933239117e658f'
export const Token_ezETH = '0x2416092f143378750bb29b79ed961ab195cceea5'
export const ZERO_ADDR = '0x0000000000000000000000000000000000000000'

export const START_BLOCK = {
    EzETH: 185410811,
    CamelotPool: 185542958,
    NFPManager: 185542958,
}

export const BOOST = {
    RENZO_DEPOSIT: 1,
    CAMELOT_POOL: 4,
}

// points won't be counted for these addresses
export const ADDRESSES_EXCLUDED = [
    ZERO_ADDR,
    CAMELOT_ALGEBRA_POOL, // Camelot: ezEth/Eth Algebra Pool
]
