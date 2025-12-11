package logger

import (
	"os"
	"sync"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	Log  *zap.Logger
	once sync.Once
)

// Init initializes the global logger
// env: "production" or "development"
func Init(env string) {
	once.Do(func() {
		var config zap.Config

		if env == "production" {
			config = zap.NewProductionConfig()
			config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
		} else {
			config = zap.NewDevelopmentConfig()
			config.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		}

		// Set default output to stdout
		config.OutputPaths = []string{"stdout"}
		config.ErrorOutputPaths = []string{"stderr"}

		var err error
		Log, err = config.Build()
		if err != nil {
			panic(err)
		}
	})
}

// Sync flushes any buffered log entries
func Sync() {
	if Log != nil {
		Log.Sync()
	}
}

// Helper functions for easy access
func Info(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development")
	}
	Log.Info(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development")
	}
	Log.Error(msg, fields...)
}

func Debug(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development")
	}
	Log.Debug(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development")
	}
	Log.Warn(msg, fields...)
}

// Fatal logs a message at FatalLevel and then calls os.Exit(1).
func Fatal(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development")
	}
	Log.Fatal(msg, fields...)
	os.Exit(1)
}
