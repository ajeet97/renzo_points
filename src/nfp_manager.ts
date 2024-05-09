import {
    DecreaseLiquidityEvent,
    IncreaseLiquidityEvent,
    NonfungiblePositionManagerContext,
    NonfungiblePositionManagerProcessor,
    TransferEvent,
} from "./types/eth/nonfungiblepositionmanager.js";
import { BOOST, CAMELOT_ALGEBRA_FACTORY, CAMELOT_ALGEBRA_POOL, CAMELOT_NFP_MANAGER, START_BLOCK, ZERO_ADDR } from "./constants.js";
import { EthChainId } from "@sentio/sdk/eth";
import { ICamelotPosition, db } from "./db.js";
import { addBI, calcElPoints, updateAccountPoints, updateAllPositions } from "./utils.js";
import { getAlgebraFactoryContractOnContext } from "./types/eth/algebrafactory.js";

async function transferHandler(event: TransferEvent, ctx: NonfungiblePositionManagerContext) {
    if (ctx.blockNumber < START_BLOCK.NFPManager) return

    const calls: Promise<any>[] = []

    const tokenId = event.args.tokenId.toString()
    let position = await db.camelotPositions.asyncFindOne({ _id: tokenId })

    // If positions exists in db then update prev points
    if (position) {
        const deltaElPoints = calcElPoints(ctx, position)
        calls.push(updateAccountPoints(ctx, position.owner, deltaElPoints, BOOST.CAMELOT_POOL))
        console.info('NFP Manager | Transfer | update points:', tokenId, position.owner, deltaElPoints)
    } else {
        const positionInfo = await getPositionInfoByTokenId(ctx, tokenId)

        // if position does not exist on contract, it means that
        // token is burned in the same tx, so the event can be ignored
        if (!positionInfo) return

        // check if token is of pool ezEth/Eth
        if (positionInfo.poolAddress !== CAMELOT_ALGEBRA_POOL) return

        position = {
            _id: tokenId,
            tickLower: positionInfo.tickLower,
            tickUpper: positionInfo.tickUpper,
            liquidity: positionInfo.liquidity,
        } as ICamelotPosition
    }

    // Handle Burn
    if (event.args.to === ZERO_ADDR) {
        calls.push(db.camelotPositions.asyncRemove({ _id: tokenId }))
        console.info('NFP Manager | Transfer| burn:', tokenId, position)
    }
    // Handle Mint / Transfer
    else {
        // update owner
        position.owner = event.args.to
        calls.push(db.camelotPositions.asyncUpdate({ _id: tokenId }, position, { upsert: true }))

        if (event.args.from === ZERO_ADDR) console.info('NFP Manager | Transfer | mint:', tokenId, position)
        else console.info('NFP Manager | Transfer | transfer:', tokenId, position)
    }

    await Promise.all(calls)
    console.info('NFP Manager | Transfer | Processed', tokenId, ctx.blockNumber)
}

async function increaseLiquidityHandler(event: IncreaseLiquidityEvent, ctx: NonfungiblePositionManagerContext) {
    if (ctx.blockNumber < START_BLOCK.NFPManager) return
    if (event.args.pool !== CAMELOT_ALGEBRA_POOL) return

    const tokenId = event.args.tokenId.toString()
    const position = await db.camelotPositions.asyncFindOne({ _id: tokenId })

    const calls: Promise<any>[] = []

    // If positions exists then update prev points
    if (position) {
        const deltaElPoints = calcElPoints(ctx, position)
        calls.push(updateAccountPoints(ctx, position.owner, deltaElPoints, BOOST.CAMELOT_POOL))

        console.info('NFP Manager | IL | update points:', tokenId, position, deltaElPoints)
    } else {
        console.warn(`NFP Manager | IL | token position not found: ${tokenId}, EVENT IGNORED...`)
        return
        // TODO: what to do here?? throw error??
        // or create new position and get owner from contract??
    }

    // update position liquidity
    position.ezEthBalance = addBI(position.ezEthBalance || '0', event.args.amount0)
    position.liquidity = addBI(position.liquidity || '0', event.args.actualLiquidity)

    console.info('NFP Manager | IL:', tokenId, position)

    calls.push(db.camelotPositions.asyncUpdate({ _id: tokenId }, position))

    await Promise.all(calls)
    console.info('NFP Manager | IL | Processed', tokenId, ctx.blockNumber)

    // TODO: update all user's pool composition, since liquidity in the pool is updated??
    await updateAllPositions(ctx)
}

async function decreaseLiquidityHandler(event: DecreaseLiquidityEvent, ctx: NonfungiblePositionManagerContext) {
    if (ctx.blockNumber < START_BLOCK.NFPManager) return

    const tokenId = event.args.tokenId.toString()
    const position = await db.camelotPositions.asyncFindOne({ _id: tokenId })

    const calls: Promise<any>[] = []

    // If positions exists then update prev points
    if (position) {
        const deltaElPoints = calcElPoints(ctx, position)
        calls.push(updateAccountPoints(ctx, position.owner, deltaElPoints, BOOST.CAMELOT_POOL))

        console.info('NFP Manager | DL | update points:', tokenId, position.owner, deltaElPoints)
    } else {
        // Either token burned or token is not of Camelot ezEth/Eth pool
        console.warn(`NFP Manager | DL | token position not found: ${tokenId}, EVENT IGNORED...`)
        return
    }

    // update position liquidity
    position.ezEthBalance = addBI(position.ezEthBalance || '0', -event.args.amount0)
    position.liquidity = addBI(position.liquidity || '0', -event.args.liquidity)

    console.info('NFP Manager | DL:', tokenId, position)

    calls.push(db.camelotPositions.asyncUpdate({ _id: tokenId }, position))

    await Promise.all(calls)
    console.info('NFP Manager | DL | Processed', tokenId, ctx.blockNumber)

    // TODO: update all user's pool composition, since liquidity in the pool is updated??
    await updateAllPositions(ctx)
}

async function getPositionInfoByTokenId(ctx: NonfungiblePositionManagerContext, tokenId: string) {
    try {
        const positionInfo = await ctx.contract.positions(tokenId)
        const factoryContract = getAlgebraFactoryContractOnContext(ctx, CAMELOT_ALGEBRA_FACTORY)
        const poolAddress = await factoryContract.poolByPair(positionInfo.token0, positionInfo.token1)
        return {
            poolAddress,
            tickLower: Number(positionInfo.tickLower),
            tickUpper: Number(positionInfo.tickUpper),
            liquidity: positionInfo.liquidity.toString(),
        }
    } catch (e) {
        return null
    }
}

NonfungiblePositionManagerProcessor
    .bind({
        address: CAMELOT_NFP_MANAGER,
        network: EthChainId.ARBITRUM,
        // TODO: still getting older blocks, maybe because there is another process with lower start block
        startBlock: START_BLOCK.NFPManager,
    })
    .onEventTransfer(transferHandler)
    .onEventIncreaseLiquidity(increaseLiquidityHandler)
    .onEventDecreaseLiquidity(decreaseLiquidityHandler)