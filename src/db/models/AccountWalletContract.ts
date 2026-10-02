import {
  AllowNull,
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { Account } from './Account'

export type AccountWalletContractApiJson = {
  id: number
  chainId: string
  walletAddress: string
  dossierContractAddress: string
}

@Table({
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: [
        'accountPublicKey',
        'chainId',
        'walletAddress',
        'dossierContractAddress',
      ],
    },
    {
      fields: ['chainId', 'walletAddress'],
    },
    {
      fields: ['chainId', 'dossierContractAddress'],
    },
  ],
})
export class AccountWalletContract extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column(DataType.INTEGER)
  declare id: number

  @AllowNull(false)
  @ForeignKey(() => Account)
  @Column(DataType.STRING)
  declare accountPublicKey: string

  @BelongsTo(() => Account)
  declare account: Account

  @AllowNull(false)
  @Column(DataType.STRING)
  declare chainId: string

  @AllowNull(false)
  @Column(DataType.STRING)
  declare walletAddress: string

  @AllowNull(false)
  @Column(DataType.STRING)
  declare dossierContractAddress: string

  public get apiJson(): AccountWalletContractApiJson {
    return {
      id: this.id,
      chainId: this.chainId,
      walletAddress: this.walletAddress,
      dossierContractAddress: this.dossierContractAddress,
    }
  }
}
