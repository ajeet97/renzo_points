import { BigDecimal } from "@sentio/sdk"
import { ICamelotPosition, IPointState, db } from "./db.js"
import { EthContext } from "@sentio/sdk/eth"
import { totalElPoints, totalEzPoints } from "./metrics.js"
import { getAlgebraPoolContractOnContext } from "./types/eth/algebrapool.js"
import { BOOST, CAMELOT_ALGEBRA_POOL } from "./constants.js"
import { token } from "@sentio/sdk/utils"
import { FeeAmount, Pool, Position } from "@uniswap/v3-sdk"
import { Token } from "@uniswap/sdk-core"

export const addBI = (a: bigint | string, b: bigint | string) => {
    return (BigInt(a) + BigInt(b)).toString()
}

export const calcElPoints = (ctx: EthContext, state: IPointState) => {
    const timeMillis = ctx.timestamp.getTime()
    const lastBalWei = BigInt(state.ezEthBalance || '0')
    const lastUpdated = state.lastUpdatedMillis || timeMillis // default current time, so diff is 0

    const hoursPassed = (timeMillis - lastUpdated) / 3600000
    const deltaElPoints = lastBalWei.scaleDown(18).multipliedBy(hoursPassed)

    state.lastUpdatedMillis = timeMillis
    return deltaElPoints
}

export const updateAccountPoints = async (ctx: EthContext, address: string, deltaElPoints: BigDecimal, boost: number) => {
    if (deltaElPoints.isZero()) return

    let account = await db.accounts.asyncFindOne({ _id: address })
    if (!account) account = { _id: address, elPoints: '0', ezPoints: '0' }

    const deltaEzPoints = deltaElPoints.multipliedBy(boost)

    account.elPoints = BigDecimal(account.elPoints).plus(deltaElPoints).toString()
    account.ezPoints = BigDecimal(account.ezPoints).plus(deltaEzPoints).toString()

    await db.accounts.asyncUpdate({ _id: address }, account, { upsert: true })

    // track total metrics
    totalElPoints.add(ctx, deltaElPoints)
    totalEzPoints.add(ctx, deltaEzPoints)

    ctx.eventLogger.emit('point_updated', {
        distinctId: address,
        elPoints: account.elPoints,
        ezPoints: account.ezPoints,
    })
}

export const updateAllPositions = async (ctx: EthContext) => {
    const [pool, positions] = await Promise.all([
        createCamelotV3Pool(ctx),
        db.camelotPositions.asyncFind({}),
    ])

    console.info(`updating ${positions.length} positions for pool:`, pool.token0.address, pool.token1.address, pool.sqrtRatioX96, pool.liquidity, pool.tickCurrent)

    await Promise.all(positions.map(position => updatePosition(ctx, pool, position)))
}

async function updatePosition(ctx: EthContext, pool: Pool, position: ICamelotPosition) {
    // update prev points
    const deltaElPoints = calcElPoints(ctx, position)
    await updateAccountPoints(ctx, position.owner, deltaElPoints, BOOST.CAMELOT_POOL)

    // update liquidity
    const v3Position = new Position({
        pool,
        liquidity: position.liquidity,
        tickLower: position.tickLower,
        tickUpper: position.tickUpper,
    })
    position.ezEthBalance = v3Position.mintAmounts.amount0.toString()
    await db.camelotPositions.asyncUpdate({ _id: position._id }, position)
}

async function createCamelotV3Pool(ctx: EthContext) {
    const contract = getAlgebraPoolContractOnContext(ctx, CAMELOT_ALGEBRA_POOL)

    const [token0, token1] = await Promise.all([
        contract.token0(),
        contract.token1(),
    ])

    const [token0Data, token1Data, globalState, liquidity] = await Promise.all([
        token.getERC20TokenInfo(ctx, token0),
        token.getERC20TokenInfo(ctx, token1),
        contract.globalState(),
        contract.liquidity(),
    ])

    return new Pool(
        new Token(Number(ctx.chainId), token0, token0Data.decimal),
        new Token(Number(ctx.chainId), token1, token1Data.decimal),
        FeeAmount.LOWEST, // tickSpacing: 1, check: https://github.com/Uniswap/sdks/blob/main/sdks/v3-sdk/src/constants.ts
        // TODO: any better way to figure this out ^^
        globalState.price.toString(),
        liquidity.toString(),
        Number(globalState.tick),
    )
}