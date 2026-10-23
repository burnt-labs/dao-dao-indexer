import { QueryInterface, fn } from 'sequelize'
import { DataType } from 'sequelize-typescript'

module.exports = {
  async up(queryInterface: QueryInterface) {
    await queryInterface.createTable('AccountWalletContracts', {
      id: {
        primaryKey: true,
        autoIncrement: true,
        type: DataType.INTEGER,
      },
      accountPublicKey: {
        allowNull: false,
        type: DataType.STRING,
        references: {
          model: 'Accounts',
          key: 'publicKey',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      chainId: {
        allowNull: false,
        type: DataType.STRING,
      },
      walletAddress: {
        allowNull: false,
        type: DataType.STRING,
      },
      dossierContractAddress: {
        allowNull: false,
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
    await queryInterface.addIndex('AccountWalletContracts', {
      unique: true,
      fields: [
        'accountPublicKey',
        'chainId',
        'walletAddress',
        'dossierContractAddress',
      ],
    })
    await queryInterface.addIndex('AccountWalletContracts', {
      fields: ['chainId', 'walletAddress'],
    })
    await queryInterface.addIndex('AccountWalletContracts', {
      fields: ['chainId', 'dossierContractAddress'],
    })
  },
  async down(queryInterface: QueryInterface) {
    await queryInterface.dropTable('AccountWalletContracts')
  },
}
