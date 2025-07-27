# Smart Dependency Detection Example

The enhanced `react-exe` now automatically detects and loads popular dependencies when they're imported in your code. No more manual dependency configuration for common libraries!

## ✨ **Automatic Detection**

Just write your code with imports - `react-exe` will detect and load them automatically:

```tsx
import { CodeExecutor } from "react-exe";

const code = `
import { Search, Heart, Star, Download } from 'lucide-react';
import { motion } from 'framer-motion';

export default function SmartComponent() {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      style={{
        padding: '20px',
        borderRadius: '12px',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        maxWidth: '400px'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
        <Search size={24} />
        <h2 style={{ margin: 0 }}>Smart Dependencies</h2>
      </div>
      
      <p style={{ margin: '0 0 20px 0', opacity: 0.9 }}>
        This component uses Lucide React icons and Framer Motion animations,
        both loaded automatically!
      </p>
      
      <div style={{ display: 'flex', gap: '12px' }}>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          <Heart size={16} />
          Like
        </motion.button>
        
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'rgba(255,255,255,0.2)',
            border: 'none',
            borderRadius: '8px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          <Download size={16} />
          Save
        </motion.button>
      </div>
    </motion.div>
  );
}
`;

function App() {
  return (
    <CodeExecutor 
      code={code}
      // No need to specify dependencies - they're auto-detected!
      config={{
        // Auto-dependencies are enabled by default
        enableAutoDependencies: true,
      }}
    />
  );
}
```

## 🎯 **Supported Auto-Dependencies**

These popular libraries are automatically detected and loaded:

- **Icons & UI**: `lucide-react`, `react-icons`
- **Animation**: `framer-motion`
- **Routing**: `react-router-dom`
- **Forms**: `react-hook-form`, `zod`
- **Data**: `axios`, `@tanstack/react-query`
- **Utilities**: `date-fns`, `lodash`, `clsx`
- **Charts**: `recharts`
- **State**: `zustand`
- **Notifications**: `react-hot-toast`

## 🔧 **Mixed Usage: Auto + Manual Dependencies**

You can combine auto-detection with manual dependencies for custom libraries:

```tsx
import { CodeExecutor } from "react-exe";
import * as shadcnComponents from "./shadcn-components";

const code = `
import { Calendar, User, Settings } from 'lucide-react'; // Auto-loaded
import { motion } from 'framer-motion'; // Auto-loaded
import { Button } from '@/components/ui/button'; // Manual dependency
import { Card } from '@/components/ui/card'; // Manual dependency

export default function Dashboard() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ padding: '20px', maxWidth: '600px' }}
    >
      <Card style={{ padding: '20px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <User size={24} color="#3b82f6" />
          <h2 style={{ margin: 0 }}>User Profile</h2>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <Calendar size={20} color="#6b7280" />
          <span>Last login: Today</span>
        </div>
        
        <div style={{ marginTop: '20px', display: 'flex', gap: '12px' }}>
          <Button>Edit Profile</Button>
          <Button variant="outline">
            <Settings size={16} style={{ marginRight: '8px' }} />
            Settings
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}
`;

function App() {
  return (
    <CodeExecutor 
      code={code}
      config={{
        // Manual dependencies for custom components
        dependencies: {
          '@/components/ui/button': shadcnComponents.Button,
          '@/components/ui/card': shadcnComponents.Card,
        },
        // Auto-dependencies still work for popular libraries
        enableAutoDependencies: true,
      }}
    />
  );
}
```

## 🛠 **Custom Dependency Registry**

Add your own auto-loadable dependencies:

```tsx
import { CodeExecutor } from "react-exe";

const code = `
import { toast } from 'react-hot-toast'; // Auto-loaded from popular registry
import { myCustomLib } from 'my-custom-library'; // Auto-loaded from custom registry

export default function NotificationDemo() {
  const showToast = () => {
    toast.success('Hello from auto-loaded dependencies!');
    myCustomLib.doSomething();
  };

  return (
    <div style={{ padding: '20px' }}>
      <button 
        onClick={showToast}
        style={{
          padding: '12px 24px',
          background: '#10b981',
          color: 'white',
          border: 'none',
          borderRadius: '8px',
          cursor: 'pointer'
        }}
      >
        Show Toast
      </button>
    </div>
  );
}
`;

function App() {
  return (
    <CodeExecutor 
      code={code}
      config={{
        // Add custom dependencies to the auto-load registry
        customDependencyRegistry: {
          'my-custom-library': 'https://esm.sh/my-custom-library@1.0.0',
        },
      }}
    />
  );
}
```

## ⚙️ **Configuration Options**

```tsx
interface CodeExecutorConfig {
  // Manual dependencies (objects or URLs)
  dependencies?: Record<string, any | string>;
  
  // Auto-dependency options
  enableAutoDependencies?: boolean; // Default: true
  customDependencyRegistry?: Record<string, string>; // Custom auto-loadable deps
  allowedDomains?: string[]; // Default: ['esm.sh', 'cdn.skypack.dev', 'unpkg.com', 'jspm.dev']
  dependencyCache?: Map<string, any>; // External cache for persistence
  
  // Other options...
}
```

## 🚀 **Performance Benefits**

1. **Smart Loading**: Only dependencies that are actually imported get loaded
2. **Caching**: Loaded modules are cached and reused
3. **Parallel Loading**: Multiple dependencies load simultaneously
4. **No Manual Config**: Popular libraries work out of the box

## 🔒 **Security**

- Only trusted CDN domains are allowed by default
- Custom registries let you control which libraries can be auto-loaded
- Manual dependencies take precedence over auto-detected ones
- All the existing security patterns still apply

## 📝 **Example Output**

When you use the smart dependency system, you'll see helpful console messages:

```
Auto-loaded dependency: lucide-react from https://esm.sh/lucide-react@0.513.0
Auto-loaded dependency: framer-motion from https://esm.sh/framer-motion@11.0.8
```

This makes it clear which dependencies were automatically detected and loaded, helping with debugging and understanding your component's requirements. 