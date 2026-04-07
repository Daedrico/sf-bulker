import 'dotenv/config'
import { createReadStream, createWriteStream, readFileSync } from 'fs'
import { mkdir, writeFile } from 'fs/promises'
import { createInterface } from 'readline'
import { pipeline } from 'stream/promises'
import { Transform } from 'stream'
import { parse } from 'csv-parse'
import { stringify } from 'csv-stringify'
import chalk from 'chalk'
import { BulkAPI, MonitorJob } from './src/sf-bulk.js'
import { getAccessToken } from './src/sf-oauth.js'

const applyMapping = (srcFile, destFile, mapping, skipFields = []) => {
  const skip = new Set(skipFields)
  const activeMapping = Object.fromEntries(
    Object.entries(mapping).filter(([src]) => !skip.has(src))
  )
  const transform = new Transform({
    objectMode: true,
    transform(row, _, cb) {
      const out = Object.fromEntries(
        Object.entries(row)
          .filter(([key]) => !skip.has(key))
          .map(([key, value]) => [activeMapping[key] ?? key, typeof value === 'string' ? value.replace(/\r/g, '') : value])
      )
      cb(null, out)
    }
  })
  return pipeline(
    createReadStream(srcFile),
    parse({ columns: true, skip_empty_lines: true, trim: true }),
    transform,
    stringify({ header: true, record_delimiter: '\n' }),
    createWriteStream(destFile)
  )
}

const configName = process.argv[2]

if (!configName) {
  console.error(chalk.red('Usage: npm run import -- <name>'))
  process.exit(1)
}

const importData = async () => {
  const configRaw = readFileSync('./config.json', 'utf-8')
  const entries = JSON.parse(configRaw)

  const entry = entries.find(e => e.name === configName)
  if (!entry) {
    console.error(chalk.red(`No config entry found with name: "${configName}"`))
    process.exit(1)
  }

  console.log(chalk.magenta(`Target URL: ${process.env.URL}`))

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = await new Promise(resolve => rl.question(chalk.yellow('Proceed? (y/yes to confirm): '), resolve))
  rl.close()
  if (answer.trim().toLowerCase() !== 'y' && answer.trim().toLowerCase() !== 'yes') {
    console.log(chalk.red('Aborted.'))
    process.exit(0)
  }

  const token = await getAccessToken({
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    host: process.env.URL
  })

  const bulkAPI = new BulkAPI({
    accessToken: token.access_token,
    apiVersion: '64.0',
    instanceUrl: token.instance_url
  })

  MonitorJob.on('monitoring', (state) => {
    console.log(
      chalk.cyan(`Job ${state.id}`) +
      chalk.gray(' | State: ') + chalk.yellow(state.state) +
      chalk.gray(' | Processed: ') + chalk.white(state.numberRecordsProcessed) +
      chalk.gray(' | Failed: ') + (state.numberRecordsFailed > 0 ? chalk.red(state.numberRecordsFailed) : chalk.green(state.numberRecordsFailed))
    )
  })

  const { filename, object, externalIdField, operation, mapping, skipFields } = entry
  console.log('\n' + chalk.bold.blue(`Processing: ${filename}`) + chalk.gray(` | object: ${object} | operation: ${operation}`))

  let sourceFile = `./source/${filename}`

  if ((mapping && Object.keys(mapping).length > 0) || (skipFields && skipFields.length > 0)) {
    sourceFile = `./source/${filename.replace(/(\.[^.]+)$/, '_remapped$1')}`
    await applyMapping(`./source/${filename}`, sourceFile, mapping ?? {}, skipFields)
  }

  try {
    const jobRequest = {
      'object': object,
      'contentType': 'CSV',
      'operation': operation,
      'externalIdFieldName': externalIdField,
      'lineEnding': 'LF'
    }
    console.log(chalk.gray(`Source file: ${sourceFile} | Operation: ${operation} | Object: ${object} | External ID: ${externalIdField ?? 'N/A'}`))

    const response = await bulkAPI.createAndWaitJobResult(jobRequest, sourceFile)

    const finalStateJob = await bulkAPI.waitJobEnd(response.id)

    if (finalStateJob === 'JobComplete') {
      const successfulRecords = await bulkAPI.getJobSuccesfulResults(response.id)
      const failedRecords = await bulkAPI.getJobFailedResults(response.id)
      const baseName = filename.replace(/\.[^.]+$/, '')
      const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '')
      await mkdir('./output', { recursive: true })
      await writeFile(`./output/${baseName}_success_${timestamp}.csv`, successfulRecords)
      await writeFile(`./output/${baseName}_failed_${timestamp}.csv`, failedRecords)
      console.log(chalk.green.bold(`Results saved to output/${baseName}_*_${timestamp}.csv`))
    }
  } catch (e) {
    console.error(chalk.red.bold(`Error processing ${filename}:`), e)
  }
}

importData()