import { ERC20Processor } from "@sentio/sdk/eth/builtin";
import { EthChainId, RichBlock } from "@sentio/sdk/eth";
import { ERC20Context, TransferEvent } from "@sentio/sdk/eth/builtin/erc20";
import { ADDRESSES_EXCLUDED, BOOST, START_BLOCK, Token_ezETH } from "./constants.js";
import { IEzEthState, db } from "./db.js";
import { calcElPoints, updateAccountPoints, addBI } from "./utils.js";

async function transferHandler(event: TransferEvent, ctx: ERC20Context) {
    if (ctx.blockNumber < START_BLOCK.EzETH) return

    const isFromExcluded = ADDRESSES_EXCLUDED.includes(event.args.from)
    const isToExcluded = ADDRESSES_EXCLUDED.includes(event.args.to)

    let [from, to] = await Promise.all([
        isFromExcluded ? null : db.ezEthStates.asyncFindOne({ _id: event.args.from }),
        isToExcluded ? null : db.ezEthStates.asyncFindOne({ _id: event.args.to }),
    ])

    if (!from && !isFromExcluded) {
        // this should not happen (from address will be created when it gets ezEth transferred)
        console.warn(`address not found: ${event.args.from}`)
    }

    if (!to && !isToExcluded) {
        to = { _id: event.args.to } as IEzEthState
    }

    let calls: Promise<any>[] = []

    console.info('ERC20 | Transfer | isExcluded:', isFromExcluded, isToExcluded, !!from, !!to)

    if (from) {
        const deltaElPoints = calcElPoints(ctx, from)
        from.ezEthBalance = addBI(from.ezEthBalance || '0', -event.args.value)

        calls.push(
            updateAccountPoints(ctx, event.args.from, deltaElPoints, BOOST.RENZO_DEPOSIT),
            db.ezEthStates.asyncUpdate({ _id: event.args.from }, from, { upsert: true }),
        )

        console.info('ERC20 | Transfer | fromAccount:', JSON.stringify(from), deltaElPoints)
    }

    if (to) {
        const deltaElPoints = calcElPoints(ctx, to)
        to.ezEthBalance = addBI(to.ezEthBalance || '0', event.args.value)

        calls.push(
            updateAccountPoints(ctx, event.args.to, deltaElPoints, BOOST.RENZO_DEPOSIT),
            db.ezEthStates.asyncUpdate({ _id: event.args.to }, to, { upsert: true }),
        )

        console.info('ERC20 | Transfer | toAccount:', JSON.stringify(from), deltaElPoints)
    }

    await Promise.all(calls)
    console.info('ERC20 | Transfer | Processed', ctx.blockNumber)
}

async function timeIntervalHandler(_block: RichBlock, ctx: ERC20Context) {
    if (ctx.blockNumber < START_BLOCK.EzETH) return

    const states = await db.ezEthStates.asyncFind({})

    await Promise.all(states.map(async (state) => {
        const deltaElPoints = calcElPoints(ctx, state)
        await updateAccountPoints(ctx, state._id, deltaElPoints, BOOST.CAMELOT_POOL)
    }))
}

ERC20Processor
    .bind({
        address: Token_ezETH,
        network: EthChainId.ARBITRUM,
        startBlock: START_BLOCK.EzETH,
    })
    .onEventTransfer(transferHandler)
    .onTimeInterval(timeIntervalHandler, 60, 0)
