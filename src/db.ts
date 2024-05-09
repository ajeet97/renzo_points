import { AsyncNedb } from 'nedb-async'

const basePath = '/data'

export interface IAccount {
    _id: string // address
    elPoints: string // eigen layer points
    ezPoints: string // renzo points
}

export interface IPointState {
    ezEthBalance: string
    lastUpdatedMillis: number
}

export interface IEzEthState extends IPointState {
    _id: string // address
}

export interface ICamelotPosition extends IPointState {
    _id: string // tokenId
    owner: string
    liquidity: string
    tickLower: number
    tickUpper: number
}

const accounts = new AsyncNedb<IAccount>({
    filename: `${basePath}/accounts.db`,
    autoload: true,
})

const ezEthStates = new AsyncNedb<IEzEthState>({
    filename: `${basePath}/renzo_deposit_states.db`,
    autoload: true,
})

const camelotPositions = new AsyncNedb<ICamelotPosition>({
    filename: `${basePath}/camelot_positions.db`,
    autoload: true,
})

accounts.persistence.setAutocompactionInterval(60 * 1000)
ezEthStates.persistence.setAutocompactionInterval(60 * 1000)
camelotPositions.persistence.setAutocompactionInterval(60 * 1000)

export const db = {
    accounts,
    camelotPositions,
    ezEthStates,
}
