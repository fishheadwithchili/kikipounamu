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
// logLevel: "debug", "info", "warn", "error"
func Init(env string, logLevel string) {
	once.Do(func() {
		var config zap.Config
		var level zapcore.Level

		switch logLevel {
		case "debug":
			level = zap.DebugLevel
		case "warn":
			level = zap.WarnLevel
		case "error":
			level = zap.ErrorLevel
		default:
			level = zap.InfoLevel
		}

		if env == "production" {
			config = zap.NewProductionConfig()
			config.Level = zap.NewAtomicLevelAt(level)
			config.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
			config.Sampling = &zap.SamplingConfig{
				Initial:    100, // Log the first 100 messages with the same level and message
				Thereafter: 100, // Log every 100th message after that
			}
		} else {
			config = zap.NewDevelopmentConfig()
			config.Level = zap.NewAtomicLevelAt(level)
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
		Init("development", "debug")
	}
	Log.Info(msg, fields...)
}

func Error(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development", "debug")
	}
	Log.Error(msg, fields...)
}

func Debug(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development", "debug")
	}
	Log.Debug(msg, fields...)
}

func Warn(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development", "debug")
	}
	Log.Warn(msg, fields...)
}

// Fatal logs a message at FatalLevel and then calls os.Exit(1).
func Fatal(msg string, fields ...zap.Field) {
	if Log == nil {
		Init("development", "debug")
	}
	Log.Fatal(msg, fields...)
	os.Exit(1)
}
