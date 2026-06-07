import { Link } from '@tanstack/react-router';

export function LegalFooter() {
  return (
    <footer className="border-t bg-gray-50 mt-auto">
      <div className="container mx-auto px-4 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
          <div className="text-sm text-gray-600">
            © 2026 SmartDev. All rights reserved.
          </div>
          <div className="flex gap-6">
            <a 
              href="/legal.html" 
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              target="_blank"
              rel="noopener noreferrer"
            >
              Legal & Compliance
            </a>
            <a 
              href="/legal.html#tou-1" 
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Terms of Use
            </a>
            <a 
              href="/legal.html#priv-11" 
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              Privacy
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
