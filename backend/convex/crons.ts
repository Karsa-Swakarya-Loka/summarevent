import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()

// PRD §8 layer 2: expired holds become EXPIRED and their seats AVAILABLE even when nobody is writing.
crons.interval('expire holds', { minutes: 1 }, internal.rpc.sweepJob, {})

export default crons
