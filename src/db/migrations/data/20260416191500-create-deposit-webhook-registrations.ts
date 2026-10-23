import { QueryInterface, fn } from 'sequelize'
import { DataType } from 'sequelize-typescript'

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.createTable('AccountDepositWebhookRegistrations', {
      id: {
        primaryKey: true,
        autoIncrement: true,
        type: DataType.INTEGER,
      },
      description: {
        allowNull: true,
        type: DataType.STRING,
      },
      endpointUrl: {
        allowNull: false,
        type: DataType.STRING,
      },
      authHeader: {
        allowNull: true,
        type: DataType.STRING,
      },
      authToken: {
        allowNull: true,
        type: DataType.STRING,
      },
      watchedWallets: {
        allowNull: false,
        type: DataType.ARRAY(DataType.STRING),
        defaultValue: [],
      },
      allowedNativeDenoms: {
        allowNull: false,
        type: DataType.ARRAY(DataType.STRING),
        defaultValue: [],
      },
      allowedCw20Contracts: {
        allowNull: false,
        type: DataType.ARRAY(DataType.STRING),
        defaultValue: [],
      },
      enabled: {
        allowNull: false,
        type: DataType.BOOLEAN,
        defaultValue: true,
      },
      hashedManagementToken: {
        allowNull: true,
        type: DataType.STRING,
      },
      createdAt: {
        allowNull: false,
        type: DataType.DATE,
        defaultValue: fn('NOW'),
      },
      updatedAt: {
        allowNull: false,
        type: DataType.DATE,
        defaultValue: fn('NOW'),
      },
    })
    await queryInterface.addIndex('AccountDepositWebhookRegistrations', {
      fields: ['enabled'],
    })
    await queryInterface.addIndex('AccountDepositWebhookRegistrations', {
      fields: ['hashedManagementToken'],
    })
  },
  async down(queryInterface: QueryInterface) {
    await queryInterface.dropTable('AccountDepositWebhookRegistrations')
  },
}

export {}
