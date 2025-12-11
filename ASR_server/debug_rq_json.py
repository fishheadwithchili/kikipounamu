import redis
from rq import Queue, Worker
from rq.job import Job
from rq.serializers import JSONSerializer
import json
import time
import zlib

# 0. Setup Redis
r = redis.Redis(host='localhost', port=6379, db=0)

# 1. Clear previous test keys
r.delete('rq:queue:test-json-queue')
keys = r.keys('rq:job:*')
if keys:
    r.delete(*keys)

# 2. Define a dummy task function (just the name is needed for serialization)
def my_task(x, y):
    return x + y

# 3. Create Queue with JSON Serializer
q = Queue('test-json-queue', connection=r, serializer=JSONSerializer)

# 4. Enqueue a job
job = q.enqueue('src.my_module.my_task', args=(1, 2), kwargs={'foo': 'bar'}, job_id='my-test-job-id')

print(f"Job enqueued: {job.id}")

# 5. Inspect Redis
print("\n--- Redis Data Structures ---")

# Check the Queue (List)
queue_list = r.lrange('rq:queue:test-json-queue', 0, -1)
print(f"Queue List (rq:queue:test-json-queue): {queue_list}")

# Check the Job (Hash)
job_data = r.hgetall('rq:job:my-test-job-id')
print(f"Job Hash (rq:job:my-test-job-id):")
for k, v in job_data.items():
    print(f"  {k.decode()}: {v!r}")

# 6. Verify we can mimic this from "Go" (Python mimicking Go)
print("\n--- Mimicking Go Producer ---")
go_job_id = "go-job-123"
# Construct the job hash manually (as Go would)
# Note: RQ expects 'data' to be the serialized payload of function+args
payload = {
    "func_name": "src.api.tasks.process_asr_task",
    "args": ("audio_path_here",),
    "kwargs": {}
}
# JSON Serializer simply dumps this to a string
serialized_data = json.dumps(payload).encode('utf-8')
compressed_data = zlib.compress(serialized_data)

# Write Hash
r.hmset(f"rq:job:{go_job_id}", {
    "created_at": "2023-01-01T00:00:00.000000Z",
    "data": compressed_data,
    "timeout": 600,
    "status": "queued"
})

# Push to Queue
r.lpush("rq:queue:test-json-queue", go_job_id)

print(f"Go Job {go_job_id} pushed.")

# 7. Try to dequeue with RQ to see if it accepts it
# We need a worker configured with JSONSerializer
print("\n--- Verifying Consumer ---")
job_from_queue = q.dequeue_any([q], timeout=1)
if job_from_queue:
    print(f"Successfully dequeued job: {job_from_queue.id}")
    print(f"Function: {job_from_queue.func_name}")
    print(f"Args: {job_from_queue.args}")
else:
    print("Failed to dequeue job!")
