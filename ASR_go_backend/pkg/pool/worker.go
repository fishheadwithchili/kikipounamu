package pool

import (
	"log"
	"sync"
	"sync/atomic"
)

// ProcessFunc 任务处理函数
type ProcessFunc func(task interface{}) interface{}

// WorkerPool Goroutine 工作池
type WorkerPool struct {
	size       int
	taskChan   chan interface{}
	processFunc ProcessFunc
	wg         sync.WaitGroup
	running    atomic.Bool
	activeWorkers atomic.Int32
}

// NewWorkerPool 创建工作池
func NewWorkerPool(size int) *WorkerPool {
	return &WorkerPool{
		size:     size,
		taskChan: make(chan interface{}, size*10), // 缓冲区大小
	}
}

// Start 启动工作池
func (p *WorkerPool) Start(processFunc ProcessFunc) {
	p.processFunc = processFunc
	p.running.Store(true)

	for i := 0; i < p.size; i++ {
		p.wg.Add(1)
		go p.worker(i)
	}

	log.Printf("工作池启动，共 %d 个 Worker", p.size)
}

// worker 单个工作协程
func (p *WorkerPool) worker(id int) {
	defer p.wg.Done()

	for {
		select {
		case task, ok := <-p.taskChan:
			if !ok {
				log.Printf("Worker %d 退出", id)
				return
			}

			p.activeWorkers.Add(1)
			
			// 处理任务
			if p.processFunc != nil {
				p.processFunc(task)
			}

			p.activeWorkers.Add(-1)
		}
	}
}

// Submit 提交任务
func (p *WorkerPool) Submit(task interface{}) {
	if !p.running.Load() {
		log.Println("工作池已停止，无法提交任务")
		return
	}

	p.taskChan <- task
}

// Stop 停止工作池
func (p *WorkerPool) Stop() {
	p.running.Store(false)
	close(p.taskChan)
	p.wg.Wait()
	log.Println("工作池已停止")
}

// ActiveWorkers 获取活跃 worker 数量
func (p *WorkerPool) ActiveWorkers() int {
	return int(p.activeWorkers.Load())
}

// Size 获取工作池大小
func (p *WorkerPool) Size() int {
	return p.size
}
