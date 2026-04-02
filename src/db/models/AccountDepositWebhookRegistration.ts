import {
  AfterDestroy,
  AfterSave,
  AllowNull,
  AutoIncrement,
  BelongsTo,
  Column,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript'

import { Account } from './Account'

export type AccountDepositWebhookRegistrationApiJson = {
  id: number
  description: string | null
  endpointUrl: string
  authHeader: string | null
  authToken: string | null
  watchedWallets: string[]
  allowedNativeDenoms: string[]
  allowedCw20Contracts: string[]
  enabled: boolean
}

type ActiveRegistrationsCache = {
  cachedAt: number
  registrations: AccountDepositWebhookRegistration[]
}

@Table({
  timestamps: true,
})
export class AccountDepositWebhookRegistration extends Model {
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

  @AllowNull
  @Column(DataType.STRING)
  declare description: string | null

  @AllowNull(false)
  @Column(DataType.STRING)
  declare endpointUrl: string

  @AllowNull
  @Column(DataType.STRING)
  declare authHeader: string | null

  @AllowNull
  @Column(DataType.STRING)
  declare authToken: string | null

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  declare watchedWallets: string[]

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  declare allowedNativeDenoms: string[]

  @AllowNull(false)
  @Default([])
  @Column(DataType.ARRAY(DataType.STRING))
  declare allowedCw20Contracts: string[]

  @AllowNull(false)
  @Default(true)
  @Column(DataType.BOOLEAN)
  declare enabled: boolean

  get apiJson(): AccountDepositWebhookRegistrationApiJson {
    return {
      id: this.id,
      description: this.description,
      endpointUrl: this.endpointUrl,
      authHeader: this.authHeader,
      authToken: this.authToken,
      watchedWallets: this.watchedWallets || [],
      allowedNativeDenoms: this.allowedNativeDenoms || [],
      allowedCw20Contracts: this.allowedCw20Contracts || [],
      enabled: this.enabled,
    }
  }

  matchesNativeDeposit(wallet: string, denom: string): boolean {
    return (
      this.enabled &&
      (this.watchedWallets || []).includes(wallet) &&
      (this.allowedNativeDenoms || []).includes(denom)
    )
  }

  matchesCw20Deposit(wallet: string, contractAddress: string): boolean {
    return (
      this.enabled &&
      (this.watchedWallets || []).includes(wallet) &&
      (this.allowedCw20Contracts || []).includes(contractAddress)
    )
  }

  private static activeRegistrationsCache?: ActiveRegistrationsCache
  private static activeRegistrationsCacheTtlMs = 5_000

  static invalidateActiveRegistrationsCache() {
    this.activeRegistrationsCache = undefined
  }

  static async getEnabledCached(): Promise<
    AccountDepositWebhookRegistration[]
  > {
    if (
      this.activeRegistrationsCache &&
      Date.now() - this.activeRegistrationsCache.cachedAt <
        this.activeRegistrationsCacheTtlMs
    ) {
      return this.activeRegistrationsCache.registrations
    }

    const registrations = await this.findAll({
      where: {
        enabled: true,
      },
      order: [['id', 'ASC']],
    })

    this.activeRegistrationsCache = {
      cachedAt: Date.now(),
      registrations,
    }

    return registrations
  }

  static async findEnabledByPk(
    id: number
  ): Promise<AccountDepositWebhookRegistration | null> {
    return await this.findOne({
      where: {
        id,
        enabled: true,
      },
    })
  }

  @AfterSave
  static afterSaveHook() {
    this.invalidateActiveRegistrationsCache()
  }

  @AfterDestroy
  static afterDestroyHook() {
    this.invalidateActiveRegistrationsCache()
  }
}
